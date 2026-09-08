import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type { Prisma, UserStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { SESSION_TTL_MS } from "@/lib/env";
import { redis } from "@/lib/redis";

/**
 * 자체 세션 (DEC-030 · DEC-035).
 *
 * 쿠키에는 **불투명 난수 토큰**만 담고, DB에는 그 **SHA-256 해시**만 저장합니다.
 * DB 덤프가 유출돼도 그것만으로 남의 세션을 위조할 수 없어야 합니다 (API 키와 같은 원칙).
 *
 * **`status` 를 쿠키에 싣지 않습니다.** 실으면 DB 와 두 개의 출처가 되고
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
 *
 * **세대만으로는 닫히지 않는 창이 하나 남습니다.** 세대 키가 `userId` 로 매겨져 있어
 * DB 조회 «전»에는 읽을 수 없고(그때는 `userId` 를 모릅니다), 조회 «후»에 읽으면
 * 그 사이에 올라간 새 세대를 읽어 **스스로 유효한 스냅샷을 깔아버립니다.**
 * 그래서 `resolve()` 는 캐시를 깔기 직전에 **행이 아직 있는지 다시 확인**합니다.
 * 두 장치가 서로의 창을 덮습니다 — 자세한 순서는 `resolve()` 안의 주석에 있습니다.
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

/**
 * 세션이 즉시 죽어야 하는 계정 상태 (`DEC-040`).
 *
 * 가입 승인 절차가 사라지면서(`DEC-077`) `ACTIVE` 가 아닌 상태는 **전부** 여기
 * 있습니다. 전에는 `PENDING` 이 「유효하지만 못 들어오는」 세 번째 부류였고,
 * 그 판정을 DAL 이 했습니다 — 이제 그 부류가 없습니다.
 */
const BLOCKED_STATUSES = new Set<UserStatus>(["SUSPENDED", "WITHDRAWN"]);

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
  await invalidateSessionCache(userId);
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
          status: true,
          mustChangePassword: true,
        },
      },
    },
  });

  if (!row) return null;

  /*
   * **세대만으로는 부족합니다 — 세대는 «조회 «후»» 에 읽히기 때문입니다.**
   *
   * 세대 키가 `user:gen:{userId}` 라서 `userId` 를 알기 전에는 읽을 수 없고,
   * `userId` 는 이 조회로 비로소 알게 됩니다. 그래서 다음 순서가 가능합니다:
   *
   * > `findUnique`(살아 있음) → 관리자 정지 커밋(행 삭제) → `INCR`(G→G+1)
   * > → 여기서 세대 읽기(**G+1**) → `writeCache({ACTIVE, gen: G+1})`
   *
   * 새 세대를 달고 깔린 캐시는 **유효**하므로 정지된 사용자가 15분을 더 씁니다.
   *
   * 막는 방법은 세대를 앞당기는 것이 아니라 **행이 아직 있는지 다시 확인**하는 것이고,
   * 그 확인은 이미 `touch()` 가 하고 있었습니다(삭제된 행이면 갱신이 0건).
   * 그 결과를 버리지 않고 씁니다 — 아래 `alive` 참고.
   */
  const gen = await currentGeneration(row.userId);

  const idleSince = row.lastSeenAt ?? row.createdAt;
  if (
    row.expires.getTime() <= now ||
    now - idleSince.getTime() > IDLE_TIMEOUT_MS ||
    // 차단 상태는 세션 계층에서 즉사시킨다 (DEC-040)
    BLOCKED_STATUSES.has(row.user.status)
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
    status: row.user.status,
    mustChangePassword: row.user.mustChangePassword,
    gen: gen ?? 0,
    expiresAtMs: row.expires.getTime(),
    idleSinceMs: idleSince.getTime(),
  };

  /*
   * **캐시를 깔기 전 마지막 관문.** 위 조회 이후에 세션이 폐기됐다면 여기서 걸립니다.
   * 남는 창은 「`alive` 확인 ~ `writeCache`」 사이인데, 그 사이에 폐기가 커밋되면
   * `INCR` 가 세대를 올리므로 우리가 방금 읽은 `gen` 이 옛 값이 되어 캐시가 무효화됩니다.
   * **두 장치가 서로의 창을 덮습니다** — 세대만도, 존재 확인만도 부족합니다.
   *
   * **비용:** 갱신할 때가 아니면 `touch()` 가 전에는 질의 0회로 빠져나갔는데
   * 지금은 PK `count` 가 한 번 돕니다. 캐시 미스 경로가 1회 → 2회입니다.
   * 이 경로는 세션당 15분에 한 번이라 **질의 하나를 주고 창을 닫는 거래**입니다.
   *
   * **절대 방어는 아닙니다.** Redis 는 살아 있는데 `INCR` 만 실패하면 두 번째 창은
   * 열린 채입니다 — 그것이 `cacheInvalidated: false` 이고, 그때는 서버 로그와
   * 화면 경고로 알립니다 (`DEC-036`·`DEC-043`).
   */
  const alive = await touch(row.id, idleSince, now);
  if (!alive) return null;

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
    status,
    mustChangePassword,
  } = c;
  return {
    sessionId,
    userId,
    username,
    name,
    department,
    status,
    mustChangePassword,
  };
}

/**
 * 슬라이딩 만료는 **DB 쪽에서** 합니다.
 * 쿠키 재발급으로 하면 서버 컴포넌트 렌더 중 `cookies().set()` 이라 터집니다 (`DEC-035`).
 */
async function touch(
  sessionId: string,
  lastSeen: Date,
  now: number
): Promise<boolean> {
  try {
    if (now - lastSeen.getTime() < LAST_SEEN_WRITE_INTERVAL_MS) {
      // 아직 갱신할 때가 아니다. 그래도 **행이 살아 있는지는** 확인한다 —
      // 이 값이 캐시 스냅샷의 유효성을 보증한다. PK 조회라 쓰기보다 싸다.
      return (await db.session.count({ where: { id: sessionId } })) === 1;
    }
    // `updateMany` 를 쓰는 이유: 없는 행에 예외 대신 `count: 0` 을 돌려준다.
    const { count } = await db.session.updateMany({
      where: { id: sessionId },
      data: {
        lastSeenAt: new Date(now),
        expires: new Date(now + SESSION_TTL_MS),
      },
    });
    return count === 1;
  } catch {
    /*
     * **DB 오류는 「행이 없다」와 다릅니다.** 여기서 `false` 를 돌려주면
     * DB 가 잠깐 흔들릴 때 멀쩡한 사용자가 전부 로그아웃됩니다.
     * 갱신 실패는 치명적이지 않고 다음 요청에서 다시 시도합니다.
     */
    return true;
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

/**
 * 활성 세션 개별 종료 (FR-USER-006). 남의 세션은 못 지운다.
 *
 * 성공·실패를 **구분해서 돌려주지 않습니다** — 없는 세션과 남의 세션이 같은 결과라
 * 세션 id 열거 오라클이 되지 않습니다. 다만 호출부가 **감사 로그를 남길지** 판단할 수
 * 있도록 「실제로 지웠는가」는 알려 줍니다.
 */
export async function destroyById(
  sessionId: string,
  userId: string
): Promise<boolean> {
  const row = await db.session.findUnique({
    where: { id: sessionId },
    select: { tokenHash: true, userId: true },
  });
  if (!row || row.userId !== userId) return false;
  await destroyByHash(row.tokenHash, userId);
  return true;
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

export interface RevokeResult {
  /** 지운 세션 행 수 */
  deleted: number;
  /**
   * 캐시 무효화(세대 INCR)에 성공했는가.
   *
   * **`false` 여도 본 작업은 유효합니다.** 다만 그 사용자의 캐시가 최대 15분 남을 수
   * 있으므로 호출부가 이 사실을 **감사 로그와 화면에 실어야** 합니다 —
   * 「조용히 성공한 척」과 「본 작업을 되돌림」 사이의 정답은
   * **「했고, 어디까지 됐는지 말한다」** 입니다.
   */
  cacheInvalidated: boolean;
}

/**
 * 세션 «행»만 지운다 — **트랜잭션 안에서** 부르는 용도 (`DEC-036`).
 * 캐시 무효화는 커밋 «후» `invalidateSessionCache` 로 따로 합니다 (`DEC-035` 순서).
 */
export function deleteSessionsFor(
  tx: Prisma.TransactionClient,
  userId: string,
  exceptSessionId?: string
): Promise<{ count: number }> {
  return tx.session.deleteMany({
    where: exceptSessionId
      ? { userId, id: { not: exceptSessionId } }
      : { userId },
  });
}

/**
 * 캐시 무효화 — **커밋 후에** 부릅니다.
 *
 * Redis 가 죽으면 `currentGeneration` 이 `null` 을 돌려주고 캐시는 미스가 되므로
 * **장애는 안전한 쪽으로 무너집니다.** 남는 창은 «Redis 는 살아 있는데 `INCR` 만 실패»
 * 하나뿐이고, 그때만 캐시가 최대 15분 남습니다.
 */
export async function invalidateSessionCache(userId: string): Promise<boolean> {
  try {
    await redis.incr(genKey(userId));
    await redis.expire(genKey(userId), GEN_TTL_SECONDS);
    return true;
  } catch (e) {
    console.error(
      `[session] 세대 무효화 실패 — user=${userId}. 캐시가 최대 15분 남을 수 있습니다:`,
      e instanceof Error ? e.message : e
    );
    return false;
  }
}

/**
 * 한 사용자의 세션을 전부 폐기 — 트랜잭션 밖 호출자용 얇은 래퍼.
 *
 * **Redis 실패로 던지지 않습니다** (`NFR-AVAIL-004`). 던지면 비밀번호 변경이
 * 이미 커밋된 뒤 「처리 중 문제가 발생했습니다」가 떠서 사용자가 **옛 비밀번호로 재시도**합니다.
 * 대신 결과를 돌려주어 호출부가 **말할 수 있게** 합니다.
 *
 * @param exceptSessionId 비밀번호 변경처럼 «현재 세션은 남기는» 경우.
 *   **DB 행만 남기고 캐시는 무효화합니다** — 캐시를 남기면 방금 바꾼
 *   `mustChangePassword: false` 가 15분간 반영되지 않습니다.
 */
export async function revokeAllFor(
  userId: string,
  exceptSessionId?: string
): Promise<RevokeResult> {
  const { count } = await deleteSessionsFor(db, userId, exceptSessionId);
  const cacheInvalidated = await invalidateSessionCache(userId);
  return { deleted: count, cacheInvalidated };
}

/**
 * 활성 세션 목록 (FR-USER-006).
 *
 * **`resolve()` 와 «같은» 유효 조건을 봅니다.** 전에는 `{ userId }` 만 보고 있어서
 * 만료된 세션이 목록에 남았습니다. 세션 «행»은 `resolve()` 가 **그 토큰을 다시 받았을 때만**
 * 정리되므로, 다시 쓰지 않는 기기의 행은 영원히 남습니다.
 *
 * 이 화면이 사용자에게 하는 말은 「낯선 기기가 있으면 종료하세요」입니다 —
 * **이미 죽은 세션을 침입으로 읽게 만들고, 종료를 눌러도 실제로 달라지는 것이 없습니다.**
 * 보안 화면이 거짓 경보를 내는 것이 이 버그의 값입니다.
 *
 * 조건을 여기 다시 «쓰지» 않고 `resolve()` 가 쓰는 상수를 그대로 씁니다 —
 * 두 벌이 되면 화면과 판정이 어긋납니다.
 */
export function listFor(userId: string) {
  const now = Date.now();
  return db.session.findMany({
    where: {
      userId,
      expires: { gt: new Date(now) },
      // 유휴 만료 — `resolve()` 는 `lastSeenAt ?? createdAt` 을 본다. 같은 식.
      OR: [
        { lastSeenAt: { gt: new Date(now - IDLE_TIMEOUT_MS) } },
        {
          lastSeenAt: null,
          createdAt: { gt: new Date(now - IDLE_TIMEOUT_MS) },
        },
      ],
    },
    select: {
      id: true,
      ip: true,
      userAgent: true,
      lastSeenAt: true,
      createdAt: true,
    },
    // `lastSeenAt` 은 nullable 이고 Postgres 는 DESC 에서 NULL 을 «먼저» 놓는다
    orderBy: { lastSeenAt: { sort: "desc", nulls: "last" } },
  });
}

export const sessionTtlMs = SESSION_TTL_MS;
