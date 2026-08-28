"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { z } from "zod";

import { reasonSchema } from "@/features/members/schema";
import { guard, ok, validationError, type ActionResult } from "@/lib/result";
import { requireAdminActor } from "@/server/auth/guards";
import { hashPassword } from "@/server/auth/password";
import * as memberService from "@/server/services/member.service";

/**
 * 관리자 회원 관리 액션 (DEV-05 · 5.8절).
 *
 * **5단계를 지킵니다** (`DEC-038`) — 인가 → 검증 → 소유권 → service → 캐시 무효화.
 * 감사 로그와 알림은 **service 가** 남깁니다.
 *
 * 상태·역할 변경은 전부 `member.service.transition` 하나를 지납니다 (`DEC-036`).
 * 여기서 `db.user.update` 를 부르면 `check-deps` 가 막습니다.
 */

/**
 * **`max(BULK_LIMIT)` 를 여기 두지 않습니다** (`DEC-039`).
 *
 * `DEC-039` 의 상한은 «id 중복 제거 **후**» 50건입니다. 여기서 막으면 60건 중
 * 15건이 중복인 요청(실제 45건)을 서비스가 보기도 전에 거부합니다.
 * 「50건 규칙」의 출처는 `member.service.transitionMany` **한 곳**이고,
 * 여기 있는 상한은 그것과 다른 것 — **입력 크기 방어**입니다.
 */
const idsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

const withReasonSchema = z.object({
  id: z.string().min(1),
  reason: reasonSchema,
});

function revalidateMembers() {
  revalidatePath("/admin/members");
  revalidatePath("/admin");
}

/** API-061 승인 (단건·일괄, 최대 50) */
export async function approveMembersAction(
  input: unknown
): Promise<ActionResult<memberService.BulkResult>> {
  return guard(async () => {
    const actor = await requireAdminActor();
    const parsed = idsSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    const result = await memberService.transitionMany(actor, parsed.data.ids, {
      kind: "APPROVE",
    });

    revalidateMembers();
    return ok(result);
  });
}

/** API-062 거부 (사유 필수) */
export async function rejectMemberAction(
  input: unknown
): Promise<ActionResult<memberService.TransitionResult>> {
  return guard(async () => {
    const actor = await requireAdminActor();
    const parsed = withReasonSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    const result = await memberService.transition(actor, parsed.data.id, {
      kind: "REJECT",
      reason: parsed.data.reason,
    });

    revalidateMembers();
    return ok(result);
  });
}

/**
 * 거부 취소 — 재검토 대기로 되돌린다 (`DEC-042`, `REQ-02 · 2.4`).
 *
 * 이것이 없으면 오타 한 번으로 거부한 신청이 **영구 종착역**이 되고,
 * 아이디는 `DEC-021`(점유)로 영원히 잠깁니다.
 */
export async function reopenMemberAction(
  id: unknown
): Promise<ActionResult<memberService.TransitionResult>> {
  return guard(async () => {
    const actor = await requireAdminActor();
    const parsed = z.string().min(1).safeParse(id);
    if (!parsed.success) return validationError(parsed.error);

    const result = await memberService.transition(actor, parsed.data, {
      kind: "REOPEN",
    });

    revalidateMembers();
    return ok(result);
  });
}

/** API-063 정지 (사유 필수) + 세션 전체 삭제 */
export async function suspendMemberAction(
  input: unknown
): Promise<ActionResult<memberService.TransitionResult>> {
  return guard(async () => {
    const actor = await requireAdminActor();
    const parsed = withReasonSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    const result = await memberService.transition(actor, parsed.data.id, {
      kind: "SUSPEND",
      reason: parsed.data.reason,
    });

    revalidateMembers();
    return ok(result);
  });
}

/** API-064 정지 해제 */
export async function reactivateMemberAction(
  id: unknown
): Promise<ActionResult<memberService.TransitionResult>> {
  return guard(async () => {
    const actor = await requireAdminActor();
    const parsed = z.string().min(1).safeParse(id);
    if (!parsed.success) return validationError(parsed.error);

    const result = await memberService.transition(actor, parsed.data, {
      kind: "REACTIVATE",
    });

    revalidateMembers();
    return ok(result);
  });
}

/** API-065 역할 변경 + 세션 갱신 */
export async function changeRoleAction(
  input: unknown
): Promise<ActionResult<memberService.TransitionResult>> {
  return guard(async () => {
    const actor = await requireAdminActor();
    const parsed = z
      .object({
        id: z.string().min(1),
        role: z.enum(["MEMBER", "EDITOR", "ADMIN"]),
      })
      .safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    const result = await memberService.transition(actor, parsed.data.id, {
      kind: "CHANGE_ROLE",
      role: parsed.data.role,
    });

    revalidateMembers();
    return ok(result);
  });
}

/**
 * API-066 임시 비밀번호 발급 (FR-ADM-007).
 *
 * **메일을 보내지 않으므로**(`DEC-015`) 생성된 값을 화면에 한 번 보여주고
 * 관리자가 직접 전달합니다. 그래서 반환값에 평문이 들어갑니다 —
 * **로그에는 절대 남기지 않습니다** (`NFR-PRIV-004`).
 */
export async function resetMemberPasswordAction(
  id: unknown
): Promise<ActionResult<{ username: string; temporaryPassword: string }>> {
  return guard(async () => {
    const actor = await requireAdminActor();
    const parsed = z.string().min(1).safeParse(id);
    if (!parsed.success) return validationError(parsed.error);

    // 읽어서 전달하기 쉬운 형태. 길이로 강도를 확보한다.
    const temporaryPassword = `qb-${randomBytes(6).toString("hex")}`;

    const result = await memberService.resetPassword(
      actor,
      parsed.data,
      temporaryPassword,
      hashPassword
    );

    revalidateMembers();
    return ok({ username: result.username, temporaryPassword });
  });
}
