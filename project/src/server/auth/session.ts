import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type { Role, UserStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { env, SESSION_TTL_MS } from "@/lib/env";
import { redis } from "@/lib/redis";

/**
 * 자체 세션 (DEC-030 · DEC-035).
 *
 * 쿠키에는 **불투명 난수 토큰**만 담고, DB에는 그 **SHA-256 해시**만 저장합니다.
 * DB 덤프가 유출돼도 그것만으로 남의 세션을 위조할 수 없어야 합니다 (API 키와 같은 원칙).
 *
 * **`status`·`role` 을 쿠키에 싣지 않습니다.** 실으면 DB 와 두 개의 출처가 되고
 * 서명 키가 필요해져 `DEC-030` 이 깨집니다. 정지·역할 변경 시 세션 행을 지우므로
 * **«쿠키가 있다 = 아직 유효하다»** 라는 낙관적 가정만으로 충분합니다.
 */

/** 세션에서 꺼내 쓰는 DTO. `passwordHash` 는 절대 싣지 않는다 */
export interface SessionUser {
  sessionId: string;
  userId: string;
  username: string;
  name: string;
  /**
   * DB 는 `null` 이지만 DTO 는 `undefined` 로 좁힙니다 — 표현 계층이 매번
   * `?? undefined` 를 붙이지 않도록 **경계에서 한 번만** 바꿉니다.
   * JSON 직렬화(Redis 캐시)에서도 없는 필드로 깔끔하게 빠집니다.
   */
  department?: string;
  role: Role;
  status: UserStatus;
  mustChangePassword: boolean;
}

/** 유휴 만료 — 환경 변수로 빼지 않는다 (변수 증식 방지). REQ-02 · 2.7절 */
const IDLE_TIMEOUT_MS = 12 * 60 * 60 * 1000;

/** `last_seen_at` 을 매 요청마다 쓰지 않는다 */
const LAST_SEEN_WRITE_INTERVAL_MS = 5 * 60 * 1000;

const CACHE_TTL_SECONDS = 15 * 60;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cacheKey(tokenHash: string) {
  return `sess:${tokenHash}`;
}

function userSessionsKey(userId: string) {
  return `user:sessions:${userId}`;
}

/**
 * 세션 발급. **로그인 성공 직후에만 호출합니다.**
 * 기존 세션을 지우는 것은 호출부(`signInAction`)의 책임입니다 — 세션 고정 방지.
 */
export async function issue(
  userId: string,
  meta: { ip?: string; userAgent?: string }
): Promise<{ token: string; expires: Date }> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expires = new Date(Date.now() + SESSION_TTL_MS);

  await db.session.create({
    data: {
      tokenHash,
      userId,
      expires,
      ip: meta.ip,
      userAgent: meta.userAgent,
      lastSeenAt: new Date(),
    },
  });

  try {
    await redis.sadd(userSessionsKey(userId), tokenHash);
  } catch {
    // Set 이 비어도 무효화는 DB 삭제로 이뤄진다. 캐시는 정본이 아니다.
  }

  return { token, expires };
}

/**
 * 토큰으로 세션을 조회한다. 유효하지 않으면 `null`.
 *
 * **Redis 는 조회 캐시일 뿐 `status` 의 정본이 아닙니다.** 캐시가 15분 TTL 이므로
 * 즉시 취소는 DB 행 삭제로 이뤄지고, 캐시는 그때 함께 지웁니다 (`revokeAllFor`).
 */
export async function resolve(token: string): Promise<SessionUser | null> {
  const tokenHash = hashToken(token);

  const cached = await readCache(tokenHash);
  if (cached) return cached;

  const row = await db.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          name: true,
          department: true,
          role: true,
          status: true,
          mustChangePassword: true,
        },
      },
    },
  });

  if (!row) return null;

  const now = Date.now();

  // 만료 · 유휴 만료 — 둘 다 세션 행을 지운다
  const idleSince = row.lastSeenAt ?? row.createdAt;
  if (
    row.expires.getTime() <= now ||
    now - idleSince.getTime() > IDLE_TIMEOUT_MS
  ) {
    await destroyByHash(tokenHash, row.userId);
    return null;
  }

  // 소유자가 ACTIVE 가 아니면 세션이 남아 있어도 무효 (DEV-02 · 2.7절)
  if (row.user.status !== "ACTIVE") {
    await destroyByHash(tokenHash, row.userId);
    return null;
  }

  const session: SessionUser = {
    sessionId: row.id,
    userId: row.user.id,
    username: row.user.username,
    name: row.user.name,
    department: row.user.department ?? undefined,
    role: row.user.role,
    status: row.user.status,
    mustChangePassword: row.user.mustChangePassword,
  };

  await touch(row.id, idleSince, now);
  await writeCache(tokenHash, session);

  return session;
}

/**
 * 슬라이딩 만료는 **DB 쪽에서** 합니다.
 * 쿠키 재발급으로 하면 서버 컴포넌트 렌더 중 `cookies().set()` 이라 터집니다 (`DEC-035`).
 */
async function touch(sessionId: string, lastSeen: Date, now: number) {
  if (now - lastSeen.getTime() < LAST_SEEN_WRITE_INTERVAL_MS) return;
  try {
    await db.session.update({
      where: { id: sessionId },
      data: {
        lastSeenAt: new Date(now),
        expires: new Date(now + SESSION_TTL_MS),
      },
    });
  } catch {
    // 갱신 실패는 치명적이지 않다. 다음 요청에서 다시 시도한다.
  }
}

async function readCache(tokenHash: string): Promise<SessionUser | null> {
  try {
    const raw = await redis.get(cacheKey(tokenHash));
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null; // 캐시 미스로 처리하고 DB 로 간다 (NFR-AVAIL-004)
  }
}

async function writeCache(tokenHash: string, session: SessionUser) {
  try {
    await redis.set(
      cacheKey(tokenHash),
      JSON.stringify(session),
      "EX",
      CACHE_TTL_SECONDS
    );
  } catch {
    // 캐시 실패는 무시한다
  }
}

/** 세션 하나 폐기 (로그아웃 · 활성 세션 개별 종료) */
export async function destroy(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  const row = await db.session.findUnique({
    where: { tokenHash },
    select: { userId: true },
  });
  await destroyByHash(tokenHash, row?.userId);
}

export async function destroyById(
  sessionId: string,
  userId: string
): Promise<void> {
  const row = await db.session.findUnique({
    where: { id: sessionId },
    select: { tokenHash: true, userId: true },
  });
  if (!row || row.userId !== userId) return;
  await destroyByHash(row.tokenHash, userId);
}

async function destroyByHash(tokenHash: string, userId?: string) {
  // DB 가 정본이므로 **먼저 지운다** (DEC-035)
  await db.session.deleteMany({ where: { tokenHash } });
  try {
    await redis.del(cacheKey(tokenHash));
    if (userId) await redis.srem(userSessionsKey(userId), tokenHash);
  } catch {
    // 캐시가 남아도 15분 뒤 만료된다
  }
}

/**
 * 한 사용자의 세션을 전부 폐기 — 정지·역할 변경·비밀번호 변경.
 *
 * **순서가 중요합니다: DB 커밋 → Redis 삭제** (`DEC-035`).
 * 뒤집으면 커밋 전에 들어온 요청이 살아 있는 DB 행으로 캐시를 **다시 채웁니다.**
 *
 * @param exceptTokenHash 비밀번호 변경처럼 «현재 세션은 남기는» 경우
 * @throws Redis 정리에 실패하면 던집니다 — 호출부(관리자 액션)가 재시도해야 합니다.
 */
export async function revokeAllFor(
  userId: string,
  exceptTokenHash?: string
): Promise<void> {
  const rows = await db.session.findMany({
    where: { userId },
    select: { tokenHash: true },
  });

  await db.session.deleteMany({
    where: exceptTokenHash
      ? { userId, tokenHash: { not: exceptTokenHash } }
      : { userId },
  });

  const toDrop = rows
    .map((r) => r.tokenHash)
    .filter((h) => h !== exceptTokenHash);

  if (toDrop.length === 0) return;

  // 여기서 실패하면 던진다. DB 행은 이미 지워졌으니 안전한 방향이고,
  // 최악의 경우에도 15분 TTL 로 수렴한다.
  await redis.del(...toDrop.map(cacheKey));
  if (exceptTokenHash) {
    await redis.srem(userSessionsKey(userId), ...toDrop);
  } else {
    await redis.del(userSessionsKey(userId));
  }
}

/** 활성 세션 목록 (FR-USER-006) */
export function listFor(userId: string) {
  return db.session.findMany({
    where: { userId },
    select: {
      id: true,
      ip: true,
      userAgent: true,
      lastSeenAt: true,
      createdAt: true,
    },
    orderBy: { lastSeenAt: "desc" },
  });
}

export const sessionTtlMs = SESSION_TTL_MS;
export const cookieName = env.SESSION_COOKIE_NAME;
