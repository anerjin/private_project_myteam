"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AppError } from "@/lib/errors";
import { guard, ok, type ActionResult } from "@/lib/result";
import { requireActor } from "@/server/auth/guards";
import * as relationService from "@/server/services/relation.service";
import type { RelationType } from "@/types";

/** API-017 자료 간 연결 (`FR-RES-012`) */
const schema = z.object({
  fromId: z.string().min(1).max(40),
  toId: z.string().min(1).max(40),
  relationType: z.enum(["RELATED", "SOURCE_OF", "SUPERSEDES", "PART_OF"]),
});

export async function linkResourcesAction(
  input: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "잘못된 요청입니다.");
    }
    await relationService.link(
      actor,
      parsed.data.fromId,
      parsed.data.toId,
      parsed.data.relationType as RelationType
    );
    revalidatePath("/resources");
    return ok(undefined);
  });
}

export async function unlinkResourcesAction(
  input: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "잘못된 요청입니다.");
    }
    await relationService.unlink(
      actor,
      parsed.data.fromId,
      parsed.data.toId,
      parsed.data.relationType as RelationType
    );
    revalidatePath("/resources");
    return ok(undefined);
  });
}

/**
 * 이을 자료 찾기.
 *
 * **자기 자신과 이미 이어진 것은 뺍니다** — 목록에 보이면 눌러 보게 되고,
 * 그때 「이미 이어져 있습니다」를 띄우는 것보다 안 보이는 편이 낫습니다.
 */
export async function searchLinkTargetsAction(
  resourceId: unknown,
  q: unknown
): Promise<
  ActionResult<{ id: string; title: string; typeLabel: string }[]>
> {
  return guard(async () => {
    await requireActor();
    if (typeof resourceId !== "string" || typeof q !== "string") {
      throw new AppError("VALIDATION_ERROR", "잘못된 요청입니다.");
    }
    return ok(await relationService.searchTargets(resourceId, q));
  });
}
