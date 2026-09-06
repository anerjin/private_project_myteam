"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  projectDocSchema,
  projectSchema,
  projectTaskSchema,
} from "@/features/projects/schema";
import { type ActionResult, guard, ok, validationError } from "@/lib/result";
import { requireActor } from "@/server/auth/guards";
import * as docService from "@/server/services/project-doc.service";
import * as taskService from "@/server/services/project-task.service";
import * as projectService from "@/server/services/project.service";

/**
 * 프로젝트 액션 (`FR-PROJ-*`).
 *
 * ## 인가가 한 줄인 이유
 *
 * `requireActor()` 로 「로그인했는가」만 봅니다. **승인된 회원 전원이 보고
 * 고칩니다** (`DEC-018`, 운영자 재확인 2026-09-04) — 그래서 여기에 소유권
 * 검사가 없습니다.
 *
 * 예외는 **삭제 하나**입니다. 그 판정은 데이터를 봐야 알 수 있으므로
 * service 가 합니다 (`project.service.assertCanDelete` · `DEV-05 · 5.10`).
 *
 * ## 프로젝트 id 를 함께 받습니다
 *
 * 문서·할 일 액션이 `projectId` 를 같이 받아 service 가 «이 프로젝트의
 * 것인가»를 봅니다. 안 그러면 남의 프로젝트에 있는 할 일 id 를 보내
 * **다른 프로젝트의 일정을 바꿀 수** 있습니다.
 */

const idSchema = z.string().min(1);
const idsSchema = z.array(z.string().min(1)).max(500);

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
  input: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) return validationError(parsedId.error);
    const parsed = projectSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    await projectService.update(actor, parsedId.data, parsed.data);
    revalidateProject();
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

/* ── 문서 (`FR-PROJ-006`~`009`) ────────────────────────────────── */

export async function createDocAction(
  projectId: unknown,
  slug: unknown,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsedId = idSchema.safeParse(projectId);
    if (!parsedId.success) return validationError(parsedId.error);
    const parsed = projectDocSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    const made = await docService.create(actor, parsedId.data, parsed.data);
    revalidateProject(typeof slug === "string" ? slug : undefined);
    return ok(made);
  });
}

export async function updateDocAction(
  id: unknown,
  slug: unknown,
  input: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) return validationError(parsedId.error);
    const parsed = projectDocSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    await docService.update(actor, parsedId.data, parsed.data);
    revalidateProject(typeof slug === "string" ? slug : undefined);
    return ok(undefined);
  });
}

export async function deleteDocAction(
  id: unknown,
  slug: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    await requireActor();
    const parsed = idSchema.safeParse(id);
    if (!parsed.success) return validationError(parsed.error);

    await docService.moveToTrash(parsed.data);
    revalidateProject(typeof slug === "string" ? slug : undefined);
    return ok(undefined);
  });
}

export async function restoreDocAction(
  id: unknown,
  slug: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    await requireActor();
    const parsed = idSchema.safeParse(id);
    if (!parsed.success) return validationError(parsed.error);

    await docService.restore(parsed.data);
    revalidateProject(typeof slug === "string" ? slug : undefined);
    return ok(undefined);
  });
}

/** 순서 (`FR-PROJ-007`) — **받은 배열이 정본**입니다 */
export async function reorderDocsAction(
  projectId: unknown,
  section: unknown,
  orderedIds: unknown,
  slug: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    await requireActor();
    const parsedId = idSchema.safeParse(projectId);
    if (!parsedId.success) return validationError(parsedId.error);
    const parsedSection = z
      .enum(["PLAN", "DESIGN", "DEV"])
      .safeParse(section);
    if (!parsedSection.success) return validationError(parsedSection.error);
    const parsedIds = idsSchema.safeParse(orderedIds);
    if (!parsedIds.success) return validationError(parsedIds.error);

    await docService.reorder(
      parsedId.data,
      parsedSection.data,
      parsedIds.data
    );
    revalidateProject(typeof slug === "string" ? slug : undefined);
    return ok(undefined);
  });
}

/* ── 할 일 (`FR-PROJ-010`~`018`) ───────────────────────────────── */

export async function createTaskAction(
  projectId: unknown,
  slug: unknown,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    await requireActor();
    const parsedId = idSchema.safeParse(projectId);
    if (!parsedId.success) return validationError(parsedId.error);
    const parsed = projectTaskSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    const made = await taskService.create(parsedId.data, parsed.data);
    revalidateProject(typeof slug === "string" ? slug : undefined);
    return ok(made);
  });
}

export async function updateTaskAction(
  projectId: unknown,
  id: unknown,
  slug: unknown,
  input: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    await requireActor();
    const parsedProject = idSchema.safeParse(projectId);
    if (!parsedProject.success) return validationError(parsedProject.error);
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) return validationError(parsedId.error);
    const parsed = projectTaskSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    await taskService.update(parsedProject.data, parsedId.data, parsed.data);
    revalidateProject(typeof slug === "string" ? slug : undefined);
    return ok(undefined);
  });
}

/**
 * 날짜만 바꾼다 (`FR-PROJ-015`).
 *
 * **간트에서 끌 때도 폼에 적을 때도 이 액션입니다.** 길이 갈리면 한쪽에만
 * 검증이 붙고, 대개 끄는 쪽이 빠집니다.
 */
export async function rescheduleTaskAction(
  projectId: unknown,
  id: unknown,
  slug: unknown,
  startsOn: unknown,
  endsOn: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    await requireActor();
    const shape = z.object({
      projectId: idSchema,
      id: idSchema,
      startsOn: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      endsOn: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    });
    const parsed = shape.safeParse({
      projectId,
      id,
      startsOn: startsOn ?? undefined,
      endsOn: endsOn ?? undefined,
    });
    if (!parsed.success) return validationError(parsed.error);

    await taskService.reschedule(
      parsed.data.projectId,
      parsed.data.id,
      parsed.data.startsOn,
      parsed.data.endsOn
    );
    revalidateProject(typeof slug === "string" ? slug : undefined);
    return ok(undefined);
  });
}

/** 지웁니다 — **하위도 함께.** 화면이 먼저 그렇게 말합니다 */
export async function deleteTaskAction(
  projectId: unknown,
  id: unknown,
  slug: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    await requireActor();
    const parsedProject = idSchema.safeParse(projectId);
    if (!parsedProject.success) return validationError(parsedProject.error);
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) return validationError(parsedId.error);

    await taskService.remove(parsedProject.data, parsedId.data);
    revalidateProject(typeof slug === "string" ? slug : undefined);
    return ok(undefined);
  });
}

export async function linkTasksAction(
  projectId: unknown,
  fromTaskId: unknown,
  toTaskId: unknown,
  slug: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    await requireActor();
    const shape = z.object({
      projectId: idSchema,
      fromTaskId: idSchema,
      toTaskId: idSchema,
    });
    const parsed = shape.safeParse({ projectId, fromTaskId, toTaskId });
    if (!parsed.success) return validationError(parsed.error);

    await taskService.link(
      parsed.data.projectId,
      parsed.data.fromTaskId,
      parsed.data.toTaskId
    );
    revalidateProject(typeof slug === "string" ? slug : undefined);
    return ok(undefined);
  });
}

export async function unlinkTasksAction(
  projectId: unknown,
  id: unknown,
  slug: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    await requireActor();
    const parsedProject = idSchema.safeParse(projectId);
    if (!parsedProject.success) return validationError(parsedProject.error);
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) return validationError(parsedId.error);

    await taskService.unlink(parsedProject.data, parsedId.data);
    revalidateProject(typeof slug === "string" ? slug : undefined);
    return ok(undefined);
  });
}
