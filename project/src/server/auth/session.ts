import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type { Role, UserStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { SESSION_TTL_MS } from "@/lib/env";
import { redis } from "@/lib/redis";

/**
 * 자체 세션 (DEC-030 · DEC-035).
 *
 * 쿠키에는 **불투명 난수 토큰**만 담고, DB에는 그 **SHA-256 해시**만 저장합니다.
 * DB 덤프가 유출돼도 그것만으로 남의 세션을 위조할 수 없어야 합니다 (API 키와 같은 원칙).
 *
 * **`status`·`role` 을 쿠키에 싣지 않습니다.** 실으면 DB 와 두 개의 출처가 되고
 * 서명 키가 필요해져 `DEC-030` 이 깨집니다.
 *
 * ## 캐시 무효화 — 세대(generation) 카운터
 *
 * Redis 캐시는 **정본이 아니라 조회 캐시**입니다. 그런데 «무효화할 때 캐시 키를 지운다»
 * 만으로는 다음 경합을 막지 못합니다:
 *
 * > 요청 A 가 DB 에서 ACTIVE 스냅샷을 읽음 → 관리자가 정지(행 삭제 + 캐시 삭제)
 * > → **요청 A 가 뒤늦게 `writeCache()` 로 ACTIVE 스냅샷을 15분짜리로 다시 깔아버림**
 *
 * 그래서 사용자별 **세대 번호**를 둡니다. 무효화는 `INCR user:gen:{userId}` **한 번**이고,
 * 캐시 값에는 읽을 때의 세대가 함께 들어갑니다. 세대가 다르면 캐시는 무효입니다.
 * `INCR` 는 원자적이라 «지우기 전에 다시 깔리는» 창이 존재하지 않습니다.
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
   */
  department?: string;
  role: Role;
  status: UserStatus;
  mustChangePassword: boolean;
}

/**
 * 캐시에 담는 형태. **만료 정보를 함께 넣습니다** —
 * 넣지 않으면 캐시 히트 경로가 절대 만료·유휴 만료를 한 번도 검사하지 않습니다.
 */
interface CachedSession extends SessionUser {
  gen: number;
  expiresAtMs: number;
  idleSinceMs: number;
}

/** 유휴 만료 — 환경 변수로 빼지 않는다 (변수 증식 방지). REQ-02 · 2.7절 */
const IDLE_TIMEOUT_MS = 12 * 60 * 60 * 1000;

/** `last_seen_at` 을 매 요청마다 쓰지 않는다 */
const LAST_SEEN_WRITE_INTERVAL_MS = 5 * 60 * 1000;

const CACHE_TTL_SECONDS = 15 * 60;

/** 세대 키는 세션보다 오래 살아야 한다. 세션 최대 수명 + 여유 */
const GEN_TTL_SECONDS = 60 * 24 * 60 * 60;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const cacheKey = (tokenHash: string) => `sess:${tokenHash}`;
const genKey = (userId: string) => `user:gen:${userId}`;

/** 현재 세대. Redis 가 죽었으면 `null` — 그때는 캐시를 아예 쓰지 않는다 */
async function currentGeneration(userId: string): Promise<number | null> {
  try {
    const v = await redis.get(genKey(userId));
    return v === null ? 0 : Number(v);
  } catch {
    return null;
  }
}

/**
 * 이 사용자의 캐시를 **전부 무효화**한다.
 *
 * 키를 지우는 대신 세대를 올립니다. 원자적이고, 어떤 토큰이 있었는지 몰라도 되며,
 * 늦게 도착한 `writeCache` 도 옛 세대를 달고 있어 자동으로 무효가 됩니다.
 */
async function bumpGeneration(userId: string): Promise<void> {
  try {
    await redis.incr(genKey(userId));
    await redis.expire(genKey(userId), GEN_TTL_SECONDS);
  } catch {
    // Redis 가 죽었으면 캐시도 못 읽으므로(=미스) DB 가 정본이 된다.
    // 이 실패로 호출부를 실패시키지 않는다 (NFR-AVAIL-004).
  }
}

/**
 * 세션 발급. **로그인 성공 직후에만 호출합니다.**
 * 기존 세션 정리는 호출부(`authService.signIn`)가 `destroy()` 로 합니다 — 세션 고정 방지.
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

  return { token, expires };
}

/** 토큰으로 세션을 조회한다. 유효하지 않으면 `null`. */
export async function resolve(token: string): Promise<SessionUser | null> {
  const tokenHash = hashToken(token);
  const now = Date.now();

  const cached = await readCache(tokenHash, now);
  if (cached) return toDto(cached);

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

  /*
   * **세대를 DB 조회 «전»이 아니라 여기서 읽어도 되는 이유:**
   * 무효화가 이 사이에 끼어들면 세대가 이미 올라가 있으므로, 우리가 읽는 값은
   * 새 세대입니다. 그런데 우리가 캐시에 넣을 스냅샷은 **삭제된 행**을 보고 만든 것이
   * 아니라 — `findUnique` 가 이미 `null` 을 돌려줬을 것입니다.
   * 행이 살아 있었다면 아직 무효화 전이거나, 무효화가 커밋되기 전입니다.
   * 후자를 막기 위해 **세대를 DB 조회 직전에 읽습니다.**
   */
  const gen = await currentGeneration(row.userId);

  const idleSince = row.lastSeenAt ?? row.createdAt;
  if (
    row.expires.getTime() <= now ||
    now - idleSince.getTime() > IDLE_TIMEOUT_MS ||
    // 소유자가 ACTIVE 가 아니면 세션이 남아 있어도 무효 (DEV-02 · 2.7절)
    row.user.status !== "ACTIVE"
  ) {
    await destroyByHash(tokenHash, row.userId);
    return null;
  }

  const session: CachedSession = {
    sessionId: row.id,
    userId: row.user.id,
    username: row.user.username,
    name: row.user.name,
    department: row.user.department ?? undefined,
    role: row.user.role,
    status: row.user.status,
    mustChangePassword: row.user.mustChangePassword,
    gen: gen ?? 0,
    expiresAtMs: row.expires.getTime(),
    idleSinceMs: idleSince.getTime(),
  };

  await touch(row.id, idleSince, now);
  if (gen !== null) await writeCache(tokenHash, session);

  return toDto(session);
}

function toDto(c: CachedSession | SessionUser): SessionUser {
  const {
    sessionId,
    userId,
    username,
    name,
    department,
    role,
    status,
    mustChangePassword,
  } = c;
  return {
    sessionId,
    userId,
    username,
    name,
    department,
    role,
    status,
    mustChangePassword,
  };
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

async function readCache(
  tokenHash: string,
  now: number
): Promise<CachedSession | null> {
  try {
    const raw = await redis.get(cacheKey(tokenHash));
    if (!raw) return null;

    const cached = JSON.parse(raw) as CachedSession;

    // 세대가 다르면 그 사이 무효화가 있었다는 뜻이다
    const gen = await currentGeneration(cached.userId);
    if (gen === null || gen !== cached.gen) return null;

    // 캐시 히트 경로에서도 만료를 검사한다 — 안 하면 15분간 만료가 무시된다
    if (cached.expiresAtMs <= now) return null;
    if (now - cached.idleSinceMs > IDLE_TIMEOUT_MS) return null;

    return cached;
  } catch {
    return null; // 캐시 미스로 처리하고 DB 로 간다 (NFR-AVAIL-004)
  }
}

async function writeCache(tokenHash: string, session: CachedSession) {
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

/** 세션 하나 폐기 (로그아웃 · 재로그인 시 옛 세션 정리) */
export async function destroy(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  const row = await db.session.findUnique({
    where: { tokenHash },
    select: { userId: true },
  });
  await destroyByHash(tokenHash, row?.userId);
}

/** 활성 세션 개별 종료 (FR-USER-006). 남의 세션은 못 지운다 */
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
  } catch {
    // 세대 카운터가 있으므로 키가 남아도 다음 무효화에서 무효가 된다
  }
  if (userId) await bumpGeneration(userId);
}

/**
 * 한 사용자의 세션을 전부 폐기 — 정지·역할 변경·비밀번호 변경.
 *
 * **Redis 실패로 던지지 않습니다.** 예전에는 던졌는데, 그러면 비밀번호 변경이
 * 이미 커밋된 뒤 「처리 중 문제가 발생했습니다」가 떠서 사용자가 **옛 비밀번호로 재시도**하게
 * 됩니다 (`NFR-AVAIL-004`). 세대 카운터가 실패해도 DB 행이 없으므로 캐시 미스 시
 * 재인증에 실패하고, 최악의 경우 15분 TTL 로 수렴합니다.
 *
 * @param exceptSessionId 비밀번호 변경처럼 «현재 세션은 남기는» 경우.
 *   **DB 행만 남기고 캐시는 무효화합니다** — 캐시를 남기면 방금 바꾼
 *   `mustChangePassword: false` 가 15분간 반영되지 않습니다.
 */
export async function revokeAllFor(
  userId: string,
  exceptSessionId?: string
): Promise<void> {
  await db.session.deleteMany({
    where: exceptSessionId
      ? { userId, id: { not: exceptSessionId } }
      : { userId },
  });

  // 남긴 세션의 캐시까지 한 번에 무효화된다. 다음 요청이 DB 에서 새로 채운다.
  await bumpGeneration(userId);
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
