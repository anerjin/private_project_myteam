import "server-only";

import Redis from "ioredis";

import { env } from "@/lib/env";

/**
 * ioredis 싱글턴 (DEV-06 · 6.8절).
 *
 * **Redis 장애를 서비스 장애로 만들지 않습니다** (`NFR-AVAIL-004`).
 * 캐시 조회는 미스로 처리하고 DB로 폴백합니다. 그래서
 * `maxRetriesPerRequest` 를 낮게 두어 **빨리 실패하게** 합니다 —
 * 무한정 재시도하면 요청이 통째로 매달립니다.
 */

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createClient(): Redis {
  const client = new Redis(env.REDIS_URL, {
    /*
     * **오프라인 큐는 켜두고, 대신 명령에 타임아웃을 겁니다.**
     *
     * 처음에는 `enableOfflineQueue: false` 로 두었는데 실측해 보니 한 버그를
     * 다른 버그로 바꾼 것이었습니다 — 이 옵션은 연결이 «아직» 맺히지 않은
     * 기동 직후의 첫 명령까지 실패시킵니다. 그러면 서버 재시작 직후 요청이
     * 레이트리밋을 그냥 통과합니다.
     *
     * | 설정 | Redis 정상 | Redis 중지 |
     * | --- | --- | --- |
     * | `enableOfflineQueue: false` | 첫 명령 **실패 1ms** | 실패 1ms |
     * | 큐 유지 + `commandTimeout` | **성공 14ms** | **실패 1,014ms** |
     *
     * 큐를 켜두면 짧은 끊김은 재연결로 흡수되고, 정말 죽었을 때는
     * `commandTimeout` 이 상한을 만들어 「캐시 미스로 처리하고 DB 폴백」
     * (`NFR-AVAIL-004`)이 성립합니다.
     */
    commandTimeout: 1000,
    connectTimeout: 2000,
    maxRetriesPerRequest: 1,
    // 끊긴 뒤에도 재연결을 계속 시도하되 간격을 벌린다
    retryStrategy: (times) => Math.min(times * 200, 3000),
  });

  // 이벤트를 듣지 않으면 ioredis 가 unhandled error 로 프로세스를 흔든다.
  // 여기서 삼키고, 실패 판단은 호출부(캐시 헬퍼)가 한다.
  client.on("error", (err) => {
    if (env.LOG_LEVEL === "debug" || env.LOG_LEVEL === "trace") {
      console.warn("[redis]", err.message);
    }
  });

  return client;
}

export const redis = globalForRedis.redis ?? createClient();

if (env.NODE_ENV !== "production") globalForRedis.redis = redis;

/** 헬스 체크용 (API-090) */
export async function pingRedis(): Promise<void> {
  const pong = await redis.ping();
  if (pong !== "PONG") throw new Error(`예상치 못한 응답: ${pong}`);
}
