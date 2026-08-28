"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  changePasswordSchema,
  signInSchema,
  signUpSchema,
  usernameSchema,
} from "@/features/auth/schema";
import { guard, ok, validationError, type ActionResult } from "@/lib/result";
import {
  clearSessionCookie,
  readSessionToken,
  writeSessionCookie,
} from "@/server/auth/cookie";
import { requireActor } from "@/server/auth/guards";
import { destroy, sessionTtlMs } from "@/server/auth/session";
import * as userRepo from "@/server/repositories/user.repository";
import * as authService from "@/server/services/auth.service";

/**
 * 인증 액션 (DEV-05 · 5.3절).
 *
 * **Auth.js 를 쓰지 않으므로 `/api/auth/[...nextauth]` 가 없습니다** (`DEC-030`).
 * 로그인·로그아웃도 다른 폼과 같은 Server Action 입니다.
 *
 * 모든 액션은 `DEV-05 · 5.10` 의 6단계를 지킵니다 —
 * **인가 → 검증 → 소유권 → service → 감사 → 캐시 무효화.**
 * 액션 진입부가 유일한 방어선입니다 (`DEC-031`): `proxy` 는 Server Action 을 건너뜁니다.
 */

async function requestMeta() {
  const h = await headers();
  return {
    // 1단계에는 리버스 프록시가 없어 x-forwarded-for 를 신뢰할 상황은 아니지만,
    // 2단계에서 프록시가 붙으면 이 값이 정본이 된다.
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    userAgent: h.get("user-agent") ?? undefined,
  };
}

/**
 * 오픈 리다이렉트 방어 (NFR-SEC-011).
 * `//` 와 `/\` 는 브라우저가 프로토콜 상대 URL 로 읽으므로 막는다.
 */
function safeNext(next: string | undefined): string {
  if (!next) return "/dashboard";
  if (!next.startsWith("/")) return "/dashboard";
  if (next.startsWith("//") || next.startsWith("/\\")) return "/dashboard";
  return next;
}

/** API-004 로그인 */
export async function signInAction(
  input: unknown,
  next?: string
): Promise<ActionResult<{ redirectTo: string }>> {
  return guard(async () => {
    const parsed = signInSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    const meta = await requestMeta();
    const existing = await readSessionToken();

    const result = await authService.signIn(
      parsed.data.username,
      parsed.data.password,
      existing,
      meta
    );

    await writeSessionCookie(result.token, parsed.data.remember, sessionTtlMs);

    return ok({
      redirectTo: result.mustChangePassword
        ? "/change-password"
        : safeNext(next),
    });
  });
}

/** API-005 로그아웃 */
export async function signOutAction(): Promise<void> {
  const token = await readSessionToken();
  if (token) await destroy(token);
  await clearSessionCookie();
  redirect("/login");
}

/** API-002 회원가입 신청 */
export async function signUpAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const parsed = signUpSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    // `agreed`(동의 체크)는 폼의 관심사라 service 로 넘기지 않습니다.
    // 넘길 값을 명시하면 무엇이 경계를 넘는지 한눈에 보입니다.
    return ok(
      await authService.signUp({
        username: parsed.data.username,
        password: parsed.data.password,
        name: parsed.data.name,
        department: parsed.data.department,
        signupReason: parsed.data.signupReason,
      })
    );
  });
}

/** API-003 아이디 중복 확인 */
export async function checkUsernameAction(
  username: unknown
): Promise<ActionResult<{ available: boolean }>> {
  return guard(async () => {
    const parsed = usernameSchema.safeParse(username);
    if (!parsed.success) return validationError(parsed.error);
    const taken = await userRepo.isUsernameTaken(parsed.data);
    return ok({ available: !taken });
  });
}

/** API-006 비밀번호 변경 */
export async function changePasswordAction(
  input: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    // 1) 인가 — 가장 먼저
    const actor = await requireActor();

    // 2) 입력 검증
    const parsed = changePasswordSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    const token = await readSessionToken();
    if (!token) {
      throw new Error("세션 쿠키가 없습니다");
    }

    // 3~5) service 가 규칙·감사 로그를 처리한다
    await authService.changePassword(
      actor.id,
      parsed.data.currentPassword,
      parsed.data.newPassword,
      token
    );

    return ok(undefined);
  });
}
