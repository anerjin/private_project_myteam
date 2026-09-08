"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { changePasswordSchema, signInSchema } from "@/features/auth/schema";
import { env } from "@/lib/env";
import { guard, ok, validationError, type ActionResult } from "@/lib/result";
import {
  clearSessionCookie,
  readSessionToken,
  writeSessionCookie,
} from "@/server/auth/cookie";
import { AppError } from "@/lib/errors";
import { getSession, requireActor, toActor } from "@/server/auth/guards";
import { destroy, destroyById, sessionTtlMs } from "@/server/auth/session";
import * as audit from "@/server/services/audit.service";
import * as authService from "@/server/services/auth.service";

/**
 * 인증 액션 (DEV-05 · 5.3절).
 *
 * **Auth.js 를 쓰지 않으므로 `/api/auth/[...nextauth]` 가 없습니다** (`DEC-030`).
 * 로그인·로그아웃도 다른 폼과 같은 Server Action 입니다.
 *
 * 모든 액션은 `DEV-05 · 5.10` 의 **5단계**를 지킵니다 —
 * **인가 → 검증 → 소유권 → service → 캐시 무효화.**
 * **감사 로그는 service 가 남깁니다** (`DEC-038`) — 액션에 두면 웹 외 경로(API 키·CLI)가
 * 기록 없이 같은 일을 하게 됩니다. 전에 여기 적혀 있던 「6단계」는 `DEC-038` 이 폐기한
 * 옛 규칙이고, `member.actions.ts` 는 5단계로 적혀 있어 **두 파일이 서로 달랐습니다.**
 *
 * 액션 진입부가 유일한 방어선입니다 (`DEC-031`): `proxy` 는 Server Action 을 건너뜁니다.
 * 그래서 `"use server"` 는 이 폴더 안에서만 씁니다 (`DEC-046`, `check-deps` 가 강제).
 */

async function requestMeta() {
  const h = await headers();
  return {
    /*
     * **`TRUST_PROXY` 가 켜져 있을 때만 헤더를 믿습니다** (`NFR-SEC-002`).
     *
     * 1단계에는 리버스 프록시가 없습니다. 그런데도 헤더를 믿으면 공격자가
     * 매 요청 `X-Forwarded-For` 를 바꿔 **IP 기준 20회/10분 제한을 완전히 무력화**하고,
     * `audit_logs.ip` 까지 오염시킵니다. 「막고 있다고 믿는 코드」보다
     * 「이 단계에서는 IP 제한이 유효하지 않다」고 말하는 코드가 낫습니다.
     */
    ip: env.TRUST_PROXY
      ? (h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined)
      : undefined,
    userAgent: h.get("user-agent") ?? undefined,
  };
}

/**
 * 오픈 리다이렉트 방어 (NFR-SEC-011).
 *
 * **문자 접두사 비교를 쓰지 않습니다.** WHATWG URL 파서는 탭·개행(`\t`·`\n`·`\r`)을
 * **위치와 무관하게 제거**하므로 `/%0A/evil.com` 이 `//evil.com`(프로토콜 상대 URL)로
 * 해석됩니다. `startsWith("//")` 검사는 이것을 통과시킵니다.
 * 판정을 파서에 맡기고 **정규화된 값**을 돌려줍니다.
 */
function safeNext(next: string | undefined): string {
  if (!next) return "/dashboard";
  try {
    const base = "http://neowave-work.invalid";
    const url = new URL(next, base);
    // 다른 오리진으로 해석되면 외부 링크다
    if (url.origin !== base) return "/dashboard";
    return url.pathname + url.search;
  } catch {
    return "/dashboard";
  }
}

/** API-004 로그인 (`FR-AUTH-006`) — 시도 제한은 `FR-AUTH-012` */
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

    // 목적지는 **서버가** 정한다. 클라이언트가 정하면 `mustChangePassword` 같은
    // 조건을 화면마다 다시 구현하게 된다.
    return ok({
      redirectTo: result.mustChangePassword
        ? "/change-password"
        : safeNext(next),
    });
  });
}

/** API-005 로그아웃 (`FR-AUTH-009`) */
export async function signOutAction(): Promise<void> {
  const session = await getSession();
  const token = await readSessionToken();

  if (session) {
    await audit.logDetached(await toActor(session), {
      action: "USER_SIGNOUT",
      summary: `로그아웃 — ${session.username}`,
    });
  }
  if (token) await destroy(token);
  await clearSessionCookie();
  redirect("/login");
}

/** API-007 활성 세션 개별 종료 (FR-USER-006) */
export async function revokeSessionAction(
  sessionId: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    const actor = await requireActor();
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      throw new AppError("VALIDATION_ERROR", "세션을 지정해 주세요.");
    }
    // `destroyById` 가 소유자를 확인한다 — 남의 세션은 못 지운다
    const destroyed = await destroyById(sessionId, actor.id);

    /*
     * **끊은 것도 로그아웃입니다** (`REQ-02 · 2.10` 감사 대상).
     * `signOutAction` 은 `USER_SIGNOUT` 을 남기는데 여기만 침묵하면,
     * 나중에 「내 세션이 왜 끊겼지」에 답할 자료가 없습니다 —
     * 「낯선 기기를 종료했다」는 침해 대응의 흔적이기도 합니다.
     * 실제로 지웠을 때만 남깁니다(없는 세션에 기록을 만들지 않도록).
     */
    if (destroyed) {
      await audit.logDetached(actor, {
        action: "USER_SIGNOUT",
        targetType: "session",
        targetId: sessionId,
        summary: `다른 기기 세션 종료 — ${actor.username}`,
      });
    }

    revalidatePath("/me");
    return ok(undefined);
  });
}

/** API-006 비밀번호 변경 (`FR-USER-003`) */
export async function changePasswordAction(
  input: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    /*
     * 1) 인가 — 가장 먼저.
     *
     * **`requireActor()` 가 아니라 `getSession()` 을 씁니다.** `requireActor` 는
     * `mustChangePassword` 를 막는데, 이 액션은 바로 그 상태를 푸는 액션입니다.
     */
    const session = await getSession();
    if (!session) {
      throw new AppError("UNAUTHENTICATED", "로그인이 필요합니다.");
    }

    // 2) 입력 검증
    const parsed = changePasswordSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    // 3~5) service 가 규칙·감사 로그를 처리한다
    await authService.changePassword(
      session.userId,
      parsed.data.currentPassword,
      parsed.data.newPassword,
      session.sessionId,
      await requestMeta()
    );

    // 6) 캐시 무효화 — 활성 세션 목록이 바뀌었다
    revalidatePath("/me");

    return ok(undefined);
  });
}
