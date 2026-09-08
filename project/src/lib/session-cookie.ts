/**
 * 세션 쿠키 이름 — **`proxy.ts` 도 import 하는 유일한 모듈**입니다.
 *
 * `lib/env.ts` 는 `server-only` 라 proxy 모듈 그래프에 들어가면 안 됩니다 (`DEC-035`).
 * 그래서 이름만 따로 뺐습니다. 여기에는 비밀도, 서버 전용 코드도 없습니다.
 *
 * `env.ts` 와 기본값이 어긋나면 로그인이 조용히 깨지므로 **한 곳에서만 정합니다** —
 * `env.ts` 가 이 상수를 가져다 씁니다.
 */
export const DEFAULT_SESSION_COOKIE_NAME = "nw_session";

/** proxy 는 `env.ts` 를 못 쓰므로 `process.env` 를 직접 읽습니다 */
export function sessionCookieName(): string {
  return process.env.SESSION_COOKIE_NAME || DEFAULT_SESSION_COOKIE_NAME;
}
