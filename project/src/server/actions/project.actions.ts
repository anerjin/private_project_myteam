"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  projectItemCommentSchema,
  projectItemPatchSchema,
  projectItemSchema,
  projectSchema,
  projectSpanSchema,
} from "@/features/projects/schema";
import { type ActionResult, guard, ok, validationError } from "@/lib/result";
import { requireActor } from "@/server/auth/guards";
import * as commentService from "@/server/services/project-item-comment.service";
import type { ItemComment } from "@/server/services/project-item-comment.service";
import * as itemService from "@/server/services/project-item.service";
import * as projectService from "@/server/services/project.service";

/**
 * 프로젝트 액션 (`FR-PROJ-*` · `DEC-075`).
 *
 * ## 인가가 한 줄인 이유
 *
 * `requireActor()` 로 「로그인했는가」만 봅니다. **승인된 회원 전원이 보고
 * 고칩니다** (`DEC-018`, 운영자 재확인 2026-09-04) — 그래서 여기에 소유권
 * 검사가 없습니다.
 *
 * 예외는 **삭제 하나**입니다. 그 판정은 데이터를 봐야 알 수 있으므로
 * service 가 합니다 (`project.service.assertCanDelete` · `DEV-05 · 5.10`).
 * 댓글의 고치기·지우기도 같은 자리입니다.
 *
 * 🔴 **원본(Orbee)의 액션과 여기서 갈립니다.** 그쪽은 액션마다 세션에서
 *    `userId` 를 꺼내 DAL 로 넘기고, DAL 이 그것으로 조회를 좁힙니다(테넌시).
 *    우리는 그 인자가 아예 없습니다 — 넘겨 두면 다음 사람이 그것을 **관문으로**
 *    읽는데, 우리 쪽에서 그 값이 막는 것은 아무것도 없습니다.
 *
 * ## 프로젝트 id 를 함께 받습니다
 *
 * 항목·댓글 액션이 `projectId` 를 같이 받아 service 가 «이 프로젝트의
 * 것인가»를 봅니다. 안 그러면 다른 프로젝트에 있는 항목 id 를 보내
 * **그쪽 일정을 바꿀 수** 있습니다. 이것은 권한이 아니라 **주소를 가로지르지
 * 못하게 하는 것**입니다.
 *
 * ## `slug` 를 함께 받는 이유
 *
 * 상세 화면의 주소가 `/projects/<slug>` 라 무효화에 그 값이 필요합니다
 * (`revalidateProject`). id 로는 그 경로를 조립할 수 없습니다.
 */

const idSchema = z.string().min(1);

/** 화면 전체가 이 프로젝트를 봅니다 — 한 곳에서 새로 그립니다 */
function revalidateProject(slug?: string) {
  revalidatePath("/projects");
  if (slug) revalidatePath(`/projects/${slug}`, "layout");
}

export async function createProjectAction(
  input: unknown
): Promise<ActionResult<{ id: string; slug: string }>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = projectSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    const made = await projectService.create(actor, parsed.data);
    revalidateProject(made.slug);
    return ok(made);
  });
}

export async function updateProjectAction(
  id: unknown,
  slug: unknown,
  input: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) return validationError(parsedId.error);
    const parsed = projectSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    await projectService.update(actor, parsedId.data, parsed.data);
    revalidateProject(typeof slug === "string" ? slug : undefined);
    return ok(undefined);
  });
}

/**
 * 기간만 바꿉니다 — 상세 머리말의 「기간 수정」 (`DEC-075`).
 *
 * **`updateProjectAction` 을 부를 수 없습니다.** 그 대화에는 이름도 설명도
 * 상태도 없어서, 없는 값을 기본값으로 채워 보내면 기간 하나 고치려다 설명이
 * 지워집니다 — 항목의 부분 갱신이 갈라져 있는 것과 같은 근거입니다.
 */
export async function updateProjectSpanAction(
  id: unknown,
  slug: unknown,
  span: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) return validationError(parsedId.error);
    /* 🔴 **거꾸로 된 기간은 스키마가 막습니다**(`projectSpanSchema` — 프로젝트
       폼과 같은 `orderedDates`). 여기서 `if` 로 다시 재면 그 규칙이 두 곳이
       되고, 한쪽만 고치는 날 «폼으로는 막히는데 기간 수정으로는 되는» 조합이
       생깁니다. */
    const parsed = projectSpanSchema.safeParse(span);
    if (!parsed.success) return validationError(parsed.error);

    await projectService.updateSpan(actor, parsedId.data, parsed.data);
    revalidateProject(typeof slug === "string" ? slug : undefined);
    return ok(undefined);
  });
}

/** 휴지통으로 (`FR-PROJ-004`) — 소유자·`ADMIN` 만. 판정은 service 가 합니다 */
export async function deleteProjectAction(
  id: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = idSchema.safeParse(id);
    if (!parsed.success) return validationError(parsed.error);

    await projectService.moveToTrash(actor, parsed.data);
    revalidateProject();
    return ok(undefined);
  });
}

export async function restoreProjectAction(
  id: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = idSchema.safeParse(id);
    if (!parsed.success) return validationError(parsed.error);

    await projectService.restore(actor, parsed.data);
    revalidateProject();
    return ok(undefined);
  });
}

/* ── 항목 (`FR-PROJ-010` ~ `FR-PROJ-015`) ────────────────────────────────
   🔴 **셋뿐입니다** — 만들기 · 부분 갱신 · 삭제.

   옛 파일에는 일곱이 있었습니다(만들기 · 전체 수정 · 날짜만 · 색만 · 삭제 ·
   잇기 · 끊기). 계층·마일스톤·선후행이 표에서 사라졌고(`DEC-075`), 「날짜만」과
   「색만」은 부분 갱신 하나로 합쳤습니다 — 그 둘이 갈라져 있던 이유가
   *"우클릭 메뉴는 제목도 날짜도 모른다"* 였는데, 담당자가 늘면서 셋째가
   필요해졌기 때문입니다. 값 한 칸씩 액션을 만들면 그 수만큼 검증이 갈립니다.
   ────────────────────────────────────────────────────────────── */

export async function createProjectItemAction(
  projectId: unknown,
  slug: unknown,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    await requireActor();
    const parsedId = idSchema.safeParse(projectId);
    if (!parsedId.success) return validationError(parsedId.error);
    const parsed = projectItemSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    const made = await itemService.create(parsedId.data, parsed.data);
    revalidateProject(typeof slug === "string" ? slug : undefined);
    return ok(made);
  });
}

/**
 * 항목 하나를 고칩니다 — **보낸 칸만** (`FR-PROJ-014` · `FR-PROJ-015`).
 *
 * 간트에서 막대를 끌 때도, 이름을 고칠 때도, 진척률·색·담당자를 고를 때도
 * 여기로 옵니다. 길이 갈리면 한쪽에만 검증이 붙고, 대개 **끄는 쪽**이 빠집니다.
 */
export async function patchProjectItemAction(
  projectId: unknown,
  id: unknown,
  slug: unknown,
  patch: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    await requireActor();
    const parsedIds = z
      .object({ projectId: idSchema, id: idSchema })
      .safeParse({ projectId, id });
    if (!parsedIds.success) return validationError(parsedIds.error);
    const parsed = projectItemPatchSchema.safeParse(patch);
    if (!parsed.success) return validationError(parsed.error);

    await itemService.patch(
      parsedIds.data.projectId,
      parsedIds.data.id,
      parsed.data
    );
    revalidateProject(typeof slug === "string" ? slug : undefined);
    return ok(undefined);
  });
}

/** 지웁니다 — **댓글도 함께.** 화면이 먼저 「되돌릴 수 없습니다」를 말합니다 */
export async function deleteProjectItemAction(
  projectId: unknown,
  id: unknown,
  slug: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    await requireActor();
    const parsed = z
      .object({ projectId: idSchema, id: idSchema })
      .safeParse({ projectId, id });
    if (!parsed.success) return validationError(parsed.error);

    await itemService.remove(parsed.data.projectId, parsed.data.id);
    revalidateProject(typeof slug === "string" ? slug : undefined);
    return ok(undefined);
  });
}

/* ── 항목 댓글 (`DEC-074`) ─────────────────────────────────────── */

/**
 * 댓글 액션 넷이 **`revalidatePath` 를 안 부릅니다** — 이 파일에서 유일합니다.
 *
 * 서버가 그리는 화면에 나가는 것은 **수**뿐이고
 * (`project-item.service.listFor`), 대화 상자는 그 수를 아래 액션들이 돌려준
 * **목록의 길이**로 스스로 고칩니다. 여기서 `revalidateProject` 를 부르면
 * 댓글 한 줄마다 프로젝트 화면 전체(목록 · 상세 · 간트)를 다시 그리게 되는데,
 * 그 값을 치르고 얻는 것이 이미 손에 든 숫자 하나입니다.
 *
 * 🔴 **그리고 간트에서는 그것이 값을 치르는 정도로 끝나지 않습니다.** 항목의
 *    정본은 간트 화면의 상태이고(`project-gantt.tsx` 머리말), `router.refresh()`
 *    로 프롭이 새로 내려오면 **낙관적 갱신과 서버 값이 두 정본**이 됩니다 —
 *    막대를 끌던 중에 댓글을 남기면 막대가 옛 자리로 튑니다.
 *
 * ⚠️ **그래서 넷 다 «바뀐 뒤의 목록»을 돌려줍니다.** 「성공했다」만 돌려주고
 * 화면이 자기 배열을 손으로 고치면, 그 사이 남이 남긴 줄이 사라진 화면이
 * 됩니다 — 목록의 정본은 언제나 서버입니다.
 *
 * 인가는 다른 액션과 같은 한 줄(`requireActor`)입니다. 「누가 지우고 누가
 * 고치는가」는 데이터를 봐야 아는 판정이라 service 가 합니다
 * (`project-item-comment.service` · `DEV-05 · 5.10`).
 */
export async function listItemCommentsAction(
  projectId: unknown,
  itemId: unknown
): Promise<ActionResult<ItemComment[]>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = z
      .object({ projectId: idSchema, itemId: idSchema })
      .safeParse({ projectId, itemId });
    if (!parsed.success) return validationError(parsed.error);

    return ok(
      await commentService.listFor(
        actor,
        parsed.data.projectId,
        parsed.data.itemId
      )
    );
  });
}

export async function addItemCommentAction(
  projectId: unknown,
  itemId: unknown,
  input: unknown
): Promise<ActionResult<ItemComment[]>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsedIds = z
      .object({ projectId: idSchema, itemId: idSchema })
      .safeParse({ projectId, itemId });
    if (!parsedIds.success) return validationError(parsedIds.error);
    const parsed = projectItemCommentSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    await commentService.create(
      actor,
      parsedIds.data.projectId,
      parsedIds.data.itemId,
      parsed.data
    );
    return ok(
      await commentService.listFor(
        actor,
        parsedIds.data.projectId,
        parsedIds.data.itemId
      )
    );
  });
}

/** 고칩니다 — **본인만.** 판정은 service 가 합니다 */
export async function updateItemCommentAction(
  projectId: unknown,
  itemId: unknown,
  id: unknown,
  input: unknown
): Promise<ActionResult<ItemComment[]>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsedIds = z
      .object({ projectId: idSchema, itemId: idSchema, id: idSchema })
      .safeParse({ projectId, itemId, id });
    if (!parsedIds.success) return validationError(parsedIds.error);
    const parsed = projectItemCommentSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    await commentService.update(
      actor,
      parsedIds.data.projectId,
      parsedIds.data.id,
      parsed.data
    );
    return ok(
      await commentService.listFor(
        actor,
        parsedIds.data.projectId,
        parsedIds.data.itemId
      )
    );
  });
}

/** 지웁니다 — 쓴 사람 · 프로젝트를 만든 사람 · `ADMIN`. 판정은 service 가 합니다 */
export async function deleteItemCommentAction(
  projectId: unknown,
  itemId: unknown,
  id: unknown
): Promise<ActionResult<ItemComment[]>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = z
      .object({ projectId: idSchema, itemId: idSchema, id: idSchema })
      .safeParse({ projectId, itemId, id });
    if (!parsed.success) return validationError(parsed.error);

    await commentService.remove(actor, parsed.data.projectId, parsed.data.id);
    return ok(
      await commentService.listFor(
        actor,
        parsed.data.projectId,
        parsed.data.itemId
      )
    );
  });
}
