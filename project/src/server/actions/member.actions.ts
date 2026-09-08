"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { z } from "zod";

import { reasonSchema } from "@/features/members/schema";
import { guard, ok, validationError, type ActionResult } from "@/lib/result";
import { requireActor } from "@/server/auth/guards";
import { hashPassword } from "@/server/auth/password";
import * as apiKeyService from "@/server/services/api-key.service";
import * as memberService from "@/server/services/member.service";

/**
 * 관리자 회원 관리 액션 (DEV-05 · 5.8절).
 *
 * **5단계를 지킵니다** (`DEC-038`) — 인가 → 검증 → 소유권 → service → 캐시 무효화.
 * 감사 로그와 알림은 **service 가** 남깁니다.
 *
 * 상태·역할 변경은 전부 `member.service.transition` 하나를 지납니다 (`DEC-036`).
 * 여기서 `db.user.update` 를 부르면 `check-deps` 가 막습니다.
 *
 * **일괄 처리가 없습니다** (`DEC-077`). `DEC-039` 의 부분 성공 기계는 「일괄 승인」
 * 하나를 위해 있었고, 가입 승인이 사라지면서 남은 처리는 전부 단건입니다 —
 * 정지·탈퇴는 사유를 받아야 하고 역할 변경은 대상마다 값이 다릅니다.
 */

const withReasonSchema = z.object({
  id: z.string().min(1),
  reason: reasonSchema,
});

function revalidateMembers() {
  revalidatePath("/admin/members");
  revalidatePath("/admin");
}

/** API-063 정지 (사유 필수) + 세션 전체 삭제 */
export async function suspendMemberAction(
  input: unknown
): Promise<ActionResult<memberService.TransitionResult>> {
  return guard(async () => {
    const actor = await requireActor();
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
    const actor = await requireActor();
    const parsed = z.string().min(1).safeParse(id);
    if (!parsed.success) return validationError(parsed.error);

    const result = await memberService.transition(actor, parsed.data, {
      kind: "REACTIVATE",
    });

    revalidateMembers();
    return ok(result);
  });
}

/*
 * `changeRoleAction` (API-065) 이 여기 있었습니다. **지웠습니다** (`DEC-077`) —
 * 바꿀 등급이 없습니다. `USER_ROLE_CHANGE` 감사 행위도 함께 뺐습니다:
 * `audit_logs` 를 세어 보니 그 행이 **0건**이라 남길 역사가 없었습니다
 * (`features/audit/actions.ts` 머리말).
 */

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
    const actor = await requireActor();
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

/**
 * API-067 강제 탈퇴 (`FR-ADM-008`, 사유 필수).
 *
 * **되돌리는 액션이 없습니다.** 그래서 화면이 「되돌릴 수 없습니다」를 말해야 합니다 —
 * 정지에는 `REACTIVATE` 가 있지만 탈퇴에는 대응하는 전이가 없습니다.
 */
export async function withdrawMemberAction(
  input: unknown
): Promise<ActionResult<memberService.TransitionResult>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = withReasonSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    const result = await memberService.transition(actor, parsed.data.id, {
      kind: "WITHDRAW",
      reason: parsed.data.reason,
    });

    revalidateMembers();
    return ok(result);
  });
}

/**
 * API-068 회원 API 키 강제 폐기 (`FR-ADM-016`).
 *
 * ## 상태 전이와 **다른 일**입니다
 *
 * 정지·탈퇴는 `verifyKey` 가 매 요청 판정하므로 키를 폐기하지 않아도 즉시
 * 무효입니다(`DEC-037`). 이 액션은 **계정은 그대로 두고 키만** 죽입니다 —
 * 「키가 유출된 것 같다」에 대한 답이고, 그 회원은 계속 웹을 씁니다.
 *
 * 무엇을 지웠는지 이름까지 감사 로그에 남깁니다 — 회원이 「내 키가 왜
 * 죽었냐」고 물었을 때 답이 「3개」뿐이면 안 됩니다 (`FR-AUDIT-001`).
 */
export async function revokeMemberKeysAction(
  id: unknown
): Promise<ActionResult<{ revoked: number }>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = z.string().min(1).safeParse(id);
    if (!parsed.success) return validationError(parsed.error);

    const revoked = await apiKeyService.revokeAllKeysFor(actor, parsed.data);

    revalidatePath(`/admin/members/${parsed.data}`);
    revalidateMembers();
    return ok({ revoked });
  });
}
