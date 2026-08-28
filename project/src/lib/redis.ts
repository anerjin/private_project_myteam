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
    // **핵심.** 기본값(true)이면 연결이 끊긴 동안 명령을 오프라인 큐에 쌓아두고
    // 재연결까지 기다립니다. 그러면 Redis 가 죽었을 때 요청이 통째로 매달려
    // 「캐시 미스로 처리하고 DB 로 폴백」(NFR-AVAIL-004)이 성립하지 않습니다.
    // 끊긴 상태에서는 **즉시 던지게** 해서 호출부가 폴백할 기회를 줍니다.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    // 끊긴 뒤에도 계속 재연결을 시도하되 간격을 벌린다
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
