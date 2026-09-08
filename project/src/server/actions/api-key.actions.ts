"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createApiKeySchema } from "@/features/members/api-key.schema";
import { guard, ok, validationError, type ActionResult } from "@/lib/result";
import { requireActor } from "@/server/auth/guards";
import * as apiKeyService from "@/server/services/api-key.service";

/**
 * API 키 액션 (API-008 · API-009 · API-079).
 *
 * 5단계 규칙 (`DEC-038`) — 감사 로그는 service 가 남깁니다.
 * 입력 규칙은 화면과 **같은 스키마**를 씁니다 (`features/members/api-key.schema.ts`).
 */

/** API-008 발급 — 응답에만 전체 키를 담고 저장하지 않는다 */
export async function createApiKeyAction(
  input: unknown
): Promise<
  ActionResult<{ name: string; plaintext: string; keyPrefix: string }>
> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = createApiKeySchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    const key = await apiKeyService.issue(
      actor,
      parsed.data.name,
      parsed.data.scopes
    );

    revalidatePath("/me");
    return ok({
      name: key.name,
      plaintext: key.plaintext,
      keyPrefix: key.keyPrefix,
    });
  });
}

/** API-009 폐기 (본인 또는 관리자) */
export async function revokeApiKeyAction(
  keyId: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = z.string().min(1).safeParse(keyId);
    if (!parsed.success) return validationError(parsed.error);

    await apiKeyService.revoke(actor, parsed.data);

    revalidatePath("/me");
    return ok(undefined);
  });
}

/** API-079 회원 키 강제 폐기 (FR-ADM-016) */
export async function revokeMemberApiKeysAction(
  userId: unknown
): Promise<ActionResult<{ revoked: number }>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = z.string().min(1).safeParse(userId);
    if (!parsed.success) return validationError(parsed.error);

    const revoked = await apiKeyService.revokeAllKeysFor(actor, parsed.data);

    revalidatePath(`/admin/members/${parsed.data}`);
    return ok({ revoked });
  });
}
