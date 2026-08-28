/**
 * 에러 코드 (DEV-05 · 5.2절).
 *
 * **사용자에게는 `message` 만 보여줍니다.** 스택·SQL·내부 경로는 노출하지 않습니다
 * (`NFR-SEC-016`). 코드는 화면이 분기할 때 씁니다.
 *
 * `server-only` 를 넣지 않은 이유: 클라이언트도 `ActionResult.code` 로 분기합니다.
 * 여기에는 비밀이 없습니다.
 */

export const ERROR_CODES = {
  UNAUTHENTICATED: 401,
  ACCOUNT_PENDING: 403,
  ACCOUNT_BLOCKED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  DUPLICATE: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  UPSTREAM_ERROR: 502,
  INTERNAL_ERROR: 500,
  LAST_ADMIN: 409,
  // Ingest API 전용 (DEV-05 · 5.11절)
  KEY_INVALID: 401,
  KEY_REVOKED: 401,
  KEY_EXPIRED: 401,
  SCOPE_INSUFFICIENT: 403,
  DISK_FULL: 507,
  ARCHIVE_QUOTA_EXCEEDED: 507,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export function httpStatusOf(code: ErrorCode): number {
  return ERROR_CODES[code];
}

/**
 * 서비스·리포지토리가 던지는 예외.
 *
 * **액션은 이것을 잡아 `ActionResult` 로 바꿉니다** — 예외가 화면까지 올라가면
 * Next.js 오류 화면이 뜨고 사용자는 무엇을 잘못했는지 알 수 없습니다.
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fieldErrors?: Record<string, string[]>
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** 사용자에게 보여도 되는 오류인가 */
export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
