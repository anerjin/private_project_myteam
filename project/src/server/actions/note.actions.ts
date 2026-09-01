"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { noteSchema } from "@/features/notes/schema";
import { type ActionResult, guard, ok, validationError } from "@/lib/result";
import { requireActor } from "@/server/auth/guards";
import * as noteService from "@/server/services/note.service";

/**
 * 개인 메모 액션 (`FR-NOTE-001`~`003`).
 *
 * ## 인가가 한 줄입니다
 *
 * `requireActor()` 로 「로그인했는가」만 봅니다. **「이 메모가 내 것인가」는
 * 여기서 안 봅니다** — service 가 모든 질의의 `where` 에 `ownerId` 를 넣기
 * 때문입니다(`note.service` 머리 주석). 여기서 한 번 더 보면 규칙이 두 곳에
 * 생기고, 그중 하나가 낡습니다.
 *
 * ## 감사 로그를 남기지 않습니다
 *
 * 다른 쓰기 액션과 다른 점입니다. 개인 메모는 팀에 영향을 주지 않고,
 * 남기면 관리자 화면에 「누가 메모를 몇 개 고쳤는지」가 흐릅니다.
 */

const idSchema = z.string().min(1);

export async function createNoteAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = noteSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    const note = await noteService.create(actor.id, parsed.data);
    revalidatePath("/notes");
    return ok(note);
  });
}

export async function updateNoteAction(
  id: unknown,
  input: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) return validationError(parsedId.error);
    const parsed = noteSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    await noteService.update(parsedId.data, actor.id, parsed.data);
    revalidatePath("/notes");
    revalidatePath(`/notes/${parsedId.data}`);
    return ok(undefined);
  });
}

/** 휴지통으로 보냅니다 (`FR-NOTE-003`) — **지우지 않습니다** */
export async function deleteNoteAction(
  id: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = idSchema.safeParse(id);
    if (!parsed.success) return validationError(parsed.error);

    await noteService.moveToTrash(parsed.data, actor.id);
    revalidatePath("/notes");
    return ok(undefined);
  });
}

/** 휴지통에서 되살립니다 (`FR-NOTE-005`) */
export async function restoreNoteAction(
  id: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = idSchema.safeParse(id);
    if (!parsed.success) return validationError(parsed.error);

    await noteService.restore(parsed.data, actor.id);
    revalidatePath("/notes");
    return ok(undefined);
  });
}

/**
 * 영구 삭제 (`FR-NOTE-005`) — **되돌릴 수 없습니다.**
 *
 * 휴지통에 있는 것만 지웁니다. 화면이 먼저 확인을 받습니다.
 */
export async function purgeNoteAction(
  id: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = idSchema.safeParse(id);
    if (!parsed.success) return validationError(parsed.error);

    await noteService.purge(parsed.data, actor.id);
    revalidatePath("/notes");
    return ok(undefined);
  });
}

/** 휴지통 비우기 — 몇 건을 지웠는지 화면에 말해 줍니다 */
export async function emptyTrashAction(): Promise<
  ActionResult<{ purged: number }>
> {
  return guard(async () => {
    const actor = await requireActor();
    const purged = await noteService.emptyTrash(actor.id);
    revalidatePath("/notes");
    return ok({ purged });
  });
}
