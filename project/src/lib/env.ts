import "server-only";

import { z } from "zod";

import { DEFAULT_SESSION_COOKIE_NAME } from "@/lib/session-cookie";

/**
 * 환경 변수 검증 (DEV-01 · 1.8절, NFR-MAINT-006).
 *
 * **기동 시 한 번 검증하고 실패하면 즉시 종료합니다.** 값이 빠진 채로 떠서
 * 첫 요청에서 터지면 원인을 찾는 데 훨씬 오래 걸립니다.
 *
 * `server-only` 를 넣은 이유: 이 파일이 클라이언트 번들에 섞이면
 * `DATABASE_URL` 같은 값이 브라우저로 나갑니다. 빌드 타임에 막습니다.
 */

/** `"true"` / `"1"` 을 boolean 으로. 환경 변수는 언제나 문자열이다. */
const boolish = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

/** 숫자 문자열 → number. 빈 문자열은 «미설정»으로 보고 기본값을 쓴다. */
const numeric = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : Number(v)))
    .pipe(z.number().int().positive());

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_URL: z.url(),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  DATABASE_URL: z.string().startsWith("postgresql://"),
  REDIS_URL: z.string().startsWith("redis://"),

  // 세션 (DEC-030). Auth.js 를 쓰지 않으므로 서명 키가 없다.
  SESSION_COOKIE_NAME: z.string().min(1).default(DEFAULT_SESSION_COOKIE_NAME),
  // REQ-02 · 2.7 이 7일로 정했다. 14 로 두었던 것은 문서와 어긋난 값이었다.
  SESSION_TTL_DAYS: numeric(7),
  COOKIE_SECURE: boolish.default(false),

  // 파일 저장 (DEC-019)
  STORAGE_DRIVER: z.literal("local").default("local"),
  STORAGE_ROOT: z.string().min(1),
  MAX_UPLOAD_MB: numeric(50),
  MAX_ARCHIVE_MB: numeric(500),
  DISK_MIN_FREE_GB: numeric(20),

  // 미설정이면 미인증 호출로 동작한다 (DEV-05 · 5.12절).
  // `.env` 에 키만 있고 값이 빈 경우가 흔해서 빈 문자열을 «미설정»으로 접는다 —
  // octokit 에 `auth: ""` 를 넘기면 미인증과 다르게 동작할 수 있다.
  GITHUB_TOKEN: z
    .string()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),

  ADMIN_SEED_ID: z.string().min(4).optional(),
  ADMIN_SEED_PASSWORD: z.string().min(10).optional(),
});

export type Env = z.infer<typeof envSchema>;

function load(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    // 값은 찍지 않는다. 어떤 키가 왜 틀렸는지만 알려준다 (NFR-LOG-003).
    const lines = parsed.error.issues.map(
      (i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`
    );
    throw new Error(
      [
        "환경 변수 검증에 실패했습니다. `.env.example` 을 참고해 `project/.env` 를 채우세요.",
        ...lines,
      ].join("\n")
    );
  }

  return parsed.data;
}

export const env = load();

/** 파생 상수 — 여기서 한 번만 계산한다 */
export const MAX_UPLOAD_BYTES = env.MAX_UPLOAD_MB * 1024 * 1024;
export const MAX_ARCHIVE_BYTES = env.MAX_ARCHIVE_MB * 1024 * 1024;
export const SESSION_TTL_MS = env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
