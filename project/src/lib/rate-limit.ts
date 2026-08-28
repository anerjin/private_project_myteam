import "server-only";

import { redis } from "@/lib/redis";

/**
 * 레이트 리밋 (DEV-05 · 5.2절, NFR-SEC-002).
 *
 * **Redis 가 죽으면 «막지 않고 통과»시킵니다** (`NFR-AVAIL-004`).
 * 카운터를 못 세는 것과 서비스를 멈추는 것 중에서는 전자가 낫습니다.
 * 대신 그 사실이 조용히 묻히지 않게 로그를 남깁니다.
 */

export interface RateLimitResult {
  allowed: boolean;
  /** 남은 허용 횟수. 넘어섰으면 0 */
  remaining: number;
  /** 재시도까지 남은 초. 허용 상태면 0 */
  retryAfter: number;
}

const ALLOW: RateLimitResult = { allowed: true, remaining: -1, retryAfter: 0 };

/**
 * 고정 창(fixed window) 카운터.
 *
 * 슬라이딩 윈도우가 더 정확하지만, 여기서 막으려는 것은 **무차별 대입**이라
 * 창 경계에서 두 배가 새는 정도는 문제가 되지 않습니다. 구현이 단순한 쪽을 택했습니다.
 */
export async function consume(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  try {
    // INCR 후 첫 증가일 때만 만료를 건다. 매번 걸면 창이 계속 밀려
    // 공격자가 요청을 이어가는 한 영원히 만료되지 않습니다.
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }

    if (count > limit) {
      const ttl = await redis.ttl(key);
      return {
        allowed: false,
        remaining: 0,
        retryAfter: ttl > 0 ? ttl : windowSeconds,
      };
    }

    return { allowed: true, remaining: limit - count, retryAfter: 0 };
  } catch (e) {
    console.warn(
      "[rate-limit] Redis 조회 실패 — 이번 요청은 통과시킵니다:",
      e instanceof Error ? e.message : e
    );
    return ALLOW;
  }
}

/** 성공했을 때 카운터를 지운다 (로그인 성공 시 실패 누적 초기화) */
export async function reset(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch {
    // 못 지워도 창이 지나면 사라진다
  }
}

/** REQ-02 · 2.6절 로그인 시도 제한 */
export const loginLimits = {
  account: (username: string) => ({
    key: `rl:login:${username}`,
    limit: 5,
    windowSeconds: 10 * 60,
  }),
  ip: (ip: string) => ({
    key: `rl:login:ip:${ip}`,
    limit: 20,
    windowSeconds: 10 * 60,
  }),
} as const;
