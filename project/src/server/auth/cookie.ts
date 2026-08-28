import "server-only";

import { cookies } from "next/headers";

import { env } from "@/lib/env";

/**
 * 세션 쿠키 읽기·쓰기 (DEC-035).
 *
 * **`set`·`delete` 는 Server Action 과 Route Handler 에서만 부를 수 있습니다.**
 * 서버 컴포넌트 렌더 중에 부르면 Next.js 가 던집니다. 그래서 슬라이딩 만료를
 * 쿠키가 아니라 `sessions.expires` 로 처리합니다 (`server/auth/session.ts`).
 */

export async function readSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(env.SESSION_COOKIE_NAME)?.value;
}

/**
 * @param remember 「로그인 상태 유지」. **미체크면 `maxAge` 를 넣지 않아**
 *   브라우저를 닫으면 사라지는 세션 쿠키가 됩니다 (`REQ-02 · 2.7절`).
 */
export async function writeSessionCookie(
  token: string,
  remember: boolean,
  maxAgeMs: number
): Promise<void> {
  const store = await cookies();
  store.set(env.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    // 1단계는 HTTP 라 끈다. 2단계(HTTPS)에서 켜면 이름을 `__Host-` 로 승급할 수 있다 —
    // Secure + Path=/ + domain 없음이 이미 전제이기 때문이다.
    secure: env.COOKIE_SECURE,
    path: "/",
    ...(remember ? { maxAge: Math.floor(maxAgeMs / 1000) } : {}),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(env.SESSION_COOKIE_NAME);
}
