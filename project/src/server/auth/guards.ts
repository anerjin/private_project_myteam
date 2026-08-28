import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { AppError } from "@/lib/errors";
import { readSessionToken } from "@/server/auth/cookie";
import { resolve, type SessionUser } from "@/server/auth/session";
import type { Actor } from "@/server/auth/actor";
import { isEditor } from "@/server/auth/actor";

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
 * **`PENDING` 은 유효한 세션이지만 서비스에 들어올 수 없습니다** (`DEC-040`).
 * 세션 계층은 「누구인지」만 알고, 「무엇을 할 수 있는지」는 여기서 판정합니다.
 */
export async function requireActiveUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.status === "PENDING") redirect("/pending");
  if (session.mustChangePassword) redirect("/change-password");
  return session;
}

/** `/pending` 전용 — 승인 대기 중인 본인만 볼 수 있다 (FR-AUTH-007) */
export async function requirePendingUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  // 이미 승인된 사람이 주소를 직접 치고 들어온 경우
  if (session.status !== "PENDING") redirect("/dashboard");
  return session;
}

export async function requireRole(
  role: "EDITOR" | "ADMIN"
): Promise<SessionUser> {
  const session = await requireActiveUser();
  const allowed =
    role === "ADMIN" ? session.role === "ADMIN" : isEditor(toActor(session));
  if (!allowed) redirect("/403");
  return session;
}

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
  if (session.status === "PENDING") {
    throw new AppError(
      "ACCOUNT_PENDING",
      "승인 대기 중입니다. 관리자 승인 후 이용할 수 있습니다."
    );
  }
  if (session.mustChangePassword) {
    throw new AppError("FORBIDDEN", "비밀번호를 먼저 변경해 주세요.");
  }
  return toActor(session);
}

export async function requireAdminActor(): Promise<Actor> {
  const actor = await requireActor();
  if (actor.role !== "ADMIN") {
    throw new AppError("FORBIDDEN", "권한이 없습니다.");
  }
  return actor;
}

export function toActor(session: SessionUser): Actor {
  return {
    id: session.userId,
    username: session.username,
    role: session.role,
    via: "WEB",
  };
}

/**
 * 자료 수정 권한 (REQ-02 · 2.5절).
 *
 * 목 세션에 있던 판정을 그대로 옮겼습니다 — **이건 목이 아니라 실제 정책**이고
 * `NFR-MAINT-004` 가 요구하는 「인가 판정 단위 테스트」의 대상입니다.
 */
export function assertCanEditResource(actor: Actor, authorId: string): void {
  if (!isEditor(actor) && actor.id !== authorId) {
    throw new AppError("FORBIDDEN", "이 자료를 수정할 권한이 없습니다.");
  }
}
