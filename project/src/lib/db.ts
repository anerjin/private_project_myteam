import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { env } from "@/lib/env";

/**
 * PrismaClient 싱글턴 (DEV-06 · 6.8절).
 *
 * **Prisma 7 은 driver adapter 로 커넥션을 받습니다.** 스키마에 `url` 이 없으므로
 * 접속 정보의 단일 출처는 `lib/env.ts` 입니다 (`prisma.config.ts` 는 CLI 전용).
 *
 * **개발 중 전역에 붙여 두는 이유:** Next.js 는 핫 리로드마다 모듈을 다시 평가합니다.
 * 그때마다 새 클라이언트를 만들면 커넥션 풀이 계속 쌓여 결국 Postgres 의
 * `max_connections` 에 닿습니다.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? createClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/** 헬스 체크용 최소 질의 (API-090) */
export async function pingDb(): Promise<void> {
  await db.$queryRaw`SELECT 1`;
}
