"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { guard, ok, validationError, type ActionResult } from "@/lib/result";
import { requireActor } from "@/server/auth/guards";
import * as collectionService from "@/server/services/collection.service";

/**
 * 컬렉션 액션 (`FR-COLL-003`~`006`, `SCR-131`).
 *
 * **소유권 판정은 service 가** 합니다 — 데이터를 봐야 알 수 있고
 * (`actor.ts`), 읽기 쪽과 **같은 규칙**이어야 합니다: 본인 + `EDITOR` 이상.
 */

const nameSchema = z.string().trim().min(1).max(60);
const slugSchema = z.string().trim().min(1).max(80);
const idSchema = z.string().trim().min(1).max(40);
const visibilitySchema = z.enum(["PRIVATE", "TEAM"]);

function revalidateCollections(slug?: string) {
  revalidatePath("/collections");
  if (slug) revalidatePath(`/collections/${slug}`);
}

export async function createCollectionAction(
  input: unknown
): Promise<ActionResult<{ slug: string }>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = z
      .object({
        name: nameSchema,
        description: z.string().trim().max(300).optional(),
        visibility: visibilitySchema,
      })
      .safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    const r = await collectionService.create(actor, parsed.data);
    revalidateCollections(r.slug);
    return ok(r);
  });
}

export async function updateCollectionAction(
  input: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = z
      .object({
        slug: slugSchema,
        name: nameSchema.optional(),
        description: z.string().trim().max(300).nullable().optional(),
        visibility: visibilitySchema.optional(),
      })
      .safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    const { slug, ...rest } = parsed.data;
    await collectionService.update(actor, slug, rest);
    revalidateCollections(slug);
    return ok(undefined);
  });
}

export async function deleteCollectionAction(
  slug: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = slugSchema.safeParse(slug);
    if (!parsed.success) return validationError(parsed.error);

    await collectionService.remove(actor, parsed.data);
    revalidateCollections(parsed.data);
    return ok(undefined);
  });
}

/** 담기 (`FR-COLL-004`) — 이미 담긴 것을 다시 담아도 오류가 아닙니다 */
export async function addToCollectionAction(
  input: unknown
): Promise<ActionResult<{ added: boolean }>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = z
      .object({
        slug: slugSchema,
        resourceId: idSchema,
        note: z.string().trim().max(200).optional(),
      })
      .safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    const r = await collectionService.addItem(
      actor,
      parsed.data.slug,
      parsed.data.resourceId,
      parsed.data.note
    );
    revalidateCollections(parsed.data.slug);
    return ok(r);
  });
}

export async function removeFromCollectionAction(
  input: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = z
      .object({ slug: slugSchema, resourceId: idSchema })
      .safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    await collectionService.removeItem(
      actor,
      parsed.data.slug,
      parsed.data.resourceId
    );
    revalidateCollections(parsed.data.slug);
    return ok(undefined);
  });
}

/** 순서 변경 (`FR-COLL-005`) — **목록 전체**를 받습니다 */
export async function reorderCollectionAction(
  input: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = z
      .object({
        slug: slugSchema,
        resourceIds: z.array(idSchema).min(1).max(500),
      })
      .safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    await collectionService.reorderItems(
      actor,
      parsed.data.slug,
      parsed.data.resourceIds
    );
    revalidateCollections(parsed.data.slug);
    return ok(undefined);
  });
}
