import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 은 `.env` 를 **자동으로 읽지 않습니다.** 직접 읽어 줍니다.
 * `dotenv` 대신 Node 내장 API를 쓰는 이유: 의존성을 하나 늘릴 이유가 없습니다 (Node 20.12+).
 * CI 처럼 `.env` 가 없고 환경 변수가 이미 주입된 경우를 위해 실패를 삼킵니다.
 */
try {
  process.loadEnvFile(".env");
} catch {
  // .env 가 없으면 이미 주입된 process.env 를 그대로 쓴다
}

/**
 * Prisma CLI 설정 (Prisma 7).
 *
 * **Prisma 7에서 `datasource { url }` 이 스키마에서 사라졌습니다.**
 * 마이그레이션·introspection 이 쓸 접속 URL은 여기에 두고, 런타임 클라이언트는
 * driver adapter 로 커넥션을 직접 받습니다 (`src/lib/db.ts`).
 *
 * 이렇게 갈라진 덕에 **스키마 파일에 접속 정보가 남지 않습니다.**
 */
export default defineConfig({
  schema: "prisma/schema.prisma",

  // CLI 전용. 애플리케이션 런타임은 이 값을 쓰지 않습니다.
  datasource: {
    url: env("DATABASE_URL"),
  },

  migrations: {
    // Node 내장 타입 스트리퍼 대신 tsx 를 씁니다. 시드 데이터는 enum 값과 정확히
    // 맞아야 해서 타입을 포기할 수 없고, 실험적 플래그의 동작이 버전마다 다릅니다.
    seed: "tsx prisma/seed.ts",
  },
});
