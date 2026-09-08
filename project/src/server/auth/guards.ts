import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { readSessionToken } from "@/server/auth/cookie";
import { resolve, type SessionUser } from "@/server/auth/session";
import type { Actor } from "@/server/auth/actor";

/**
 * 인가의 정본 — DAL (DEC-035).
 *
 * **각 `page.tsx` 와 모든 Server Action·Route Handler 진입부에서 부릅니다.**
 * **레이아웃에서는 부르지 않습니다** — Next.js 16 의 Partial Rendering 때문에
 * 레이아웃은 네비게이션 시 재실행되지 않고, 레이아웃의 `redirect()` 는
 * page 세그먼트 렌더와 RSC Payload 를 막지 못합니다.
 *
 * `proxy.ts` 는 쿠키 유무만 보는 낙관적 검사라 **가드가 아닙니다.**
 */

/**
 * 한 렌더 패스에서 한 번만 조회합니다.
 * 페이지·컴포넌트가 각자 불러도 DB 를 여러 번 때리지 않습니다.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const token = await readSessionToken();
  if (!token) return null;
  return resolve(token);
});

/**
 * 화면용 — 로그인 안 했으면 로그인으로 (REQ-02 · 2.9절).
 *
 * **세션 계층과 여기의 분업은 그대로입니다** — 세션은 「누구인지」만 알고,
 * 「무엇을 할 수 있는지」는 여기서 판정합니다. 다만 지금 남은 판정은
 * `mustChangePassword` 하나입니다: 가입 승인 절차가 사라지면서(`DEC-077`)
 * 「로그인은 됐는데 아직 못 들어오는」 상태가 없어졌고, 나머지 상태
 * (`SUSPENDED`·`WITHDRAWN`)는 세션 계층이 즉사시킵니다 (`DEC-040`).
 */
export async function requireActiveUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mustChangePassword) redirect("/change-password");
  return session;
}

/*
 * `requireRole("EDITOR" | "ADMIN")` 이 여기 있었습니다. **지웠습니다** (`DEC-077`).
 *
 * 등급이 하나뿐이면 「이 등급인가」는 「로그인했는가」와 같은 질문입니다.
 * 그래서 `(admin)` 그룹의 각 `page.tsx` 도 이제 `requireActiveUser()` 를 부릅니다 —
 * **가드가 사라진 것이 아니라 물어보는 것이 하나 줄었습니다.**
 * `scripts/check-page-guards.mjs` 가 그 호출이 페이지마다 있는지 계속 셉니다.
 *
 * 등급이 아니라 **소유권**으로 갈리던 자리는 그대로입니다 — 그건 역할이
 * 아니었습니다 (`server/auth/actor.ts` 머리말).
 */

/**
 * 액션·핸들러용 — 리다이렉트가 아니라 **예외**를 던집니다.
 * 액션은 `guard()` 로 감싸 `ActionResult` 로 바뀝니다 (`DEV-05 · 5.2절`).
 */
export async function requireActor(): Promise<Actor> {
  const session = await getSession();
  if (!session) {
    throw new AppError("UNAUTHENTICATED", "로그인이 필요합니다.");
  }
  /*
   * **화면만 막으면 안 됩니다.** 임시 비밀번호 상태에서 화면은 `/change-password` 에
   * 갇히지만, Server Action 은 그 경로로 오는 POST 라 직접 호출하면 통과합니다.
   * 「임시 비밀번호는 관리자도 아는 값」이라는 전제가 무너집니다 (`FR-AUTH-011`).
   *
   * 예외는 `changePasswordAction` 하나이고, 그 액션은 이 함수를 쓰지 않습니다.
   */
  if (session.mustChangePassword) {
    throw new AppError("FORBIDDEN", "비밀번호를 먼저 변경해 주세요.");
  }
  return await toActor(session);
}

/**
 * 세션 → `Actor`. **`ip`·`userAgent` 를 함께 싣습니다** (`REQ-02 · 2.10`).
 *
 * `DEC-038` 이 「감사 로그를 service 에 두어도 계층 규칙은 안 깨진다」의 근거로 든 것이
 * 정확히 이 통로였습니다 — *"`ip`·`userAgent` 는 `Actor` 에 실려 파라미터로 들어온다"*.
 * **통로는 만들어졌는데 아무도 값을 넣지 않아** 모든 감사 로그의 두 칸이 `null` 이었습니다.
 *
 * > **`ip` 는 이걸 고쳐도 1단계에서는 계속 `null` 입니다.** `TRUST_PROXY` 가 꺼져 있으면
 * > `X-Forwarded-For` 를 **일부러** 믿지 않기 때문입니다 (`NFR-SEC-002`) — 리버스 프록시가
 * > 없는 단계에서 그 헤더를 믿으면 IP 레이트리밋이 무력화되고 `audit_logs.ip` 가 오염됩니다.
 * > 「안 고쳐졌다」고 판단해 그 가드를 걷어내지 마십시오. 2단계에서 프록시가 들어오면
 * > `TRUST_PROXY` 를 켜는 것으로 활성화됩니다.
 */
export async function toActor(session: SessionUser): Promise<Actor> {
  const h = await headers();
  return {
    id: session.userId,
    username: session.username,
    via: "WEB",
    ip: env.TRUST_PROXY
      ? (h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined)
      : undefined,
    userAgent: h.get("user-agent") ?? undefined,
  };
}
