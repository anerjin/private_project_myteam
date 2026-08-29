"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { settingUpdateSchema } from "@/features/admin/settings.schema";
import { guard, ok, validationError, type ActionResult } from "@/lib/result";
import { requireActor, requireAdminActor } from "@/server/auth/guards";
import * as categoryService from "@/server/services/category.service";
import * as contentTypeService from "@/server/services/content-type.service";
import * as maintenanceService from "@/server/services/maintenance.service";
import * as settingsService from "@/server/services/settings.service";
import * as tagService from "@/server/services/tag.service";

/**
 * 분류 · 타입 · 시스템 설정 액션 (`FR-ADM-012`~`015`, `SCR-231`·`SCR-261`).
 *
 * ## 인가는 **service 가** 판정합니다
 *
 * 대부분의 액션이 `requireActor()`(로그인한 활성 계정인가)까지만 보고
 * 등급 판정은 service 에 맡깁니다 — 액션마다 등급을 적으면 그 표가
 * service 의 판정과 **두 벌**이 되고, 한쪽만 고치는 날이 옵니다.
 *
 * 화면은 `ADMIN` 전용이지만(`DEC-057`) 그것은 **page 의 `requireRole`** 이
 * 하는 일이고, 액션은 화면 없이도 불릴 수 있으므로 자기 방어선을 따로
 * 갖습니다 — `categoryService.create` 는 `isAdmin` 을 직접 봅니다.
 *
 * 예외는 `runMaintenanceAction` 입니다. 그쪽은 **호출 자체가 무거워서**
 * (저장소 수만큼 GitHub 호출 + 실제 삭제) 액션에서 먼저 막습니다.
 */

/**
 * slug 규칙 — **주소에 그대로 실립니다.**
 *
 * 한글을 허용하면 필터 주소가 퍼센트 인코딩되고, 사람이 손으로 칠 수
 * 없게 됩니다 (`P6` 에서 한국어 자료 slug 로 실제로 겪은 문제).
 */
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(
    /^[a-z0-9][a-z0-9-]*$/,
    "영문 소문자·숫자·하이픈만 쓸 수 있습니다 (예: ai-tools)."
  );

const nameSchema = z.string().trim().min(1).max(50);

function revalidateTaxonomy() {
  revalidatePath("/admin/taxonomy");
  // 사이드바·필터가 같은 트리를 그립니다 — 안 비우면 옛 목록이 남습니다
  revalidatePath("/", "layout");
}

/* ── 카테고리 (`FR-ADM-012`) ────────────────────────────────────────── */

export async function createCategoryAction(
  input: unknown
): Promise<ActionResult<{ slug: string }>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = z
      .object({
        name: nameSchema,
        slug: slugSchema,
        parentSlug: slugSchema.optional(),
        icon: z.string().trim().max(40).optional(),
      })
      .safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    const r = await categoryService.create(actor, parsed.data);
    revalidateTaxonomy();
    return ok(r);
  });
}

export async function updateCategoryAction(
  input: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = z
      .object({
        slug: slugSchema,
        name: nameSchema.optional(),
        icon: z.string().trim().max(40).nullable().optional(),
        isActive: z.boolean().optional(),
      })
      .safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    const { slug, ...rest } = parsed.data;
    await categoryService.update(actor, slug, rest);
    revalidateTaxonomy();
    return ok(undefined);
  });
}

export async function reorderCategoriesAction(
  input: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = z.array(slugSchema).min(1).max(100).safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    await categoryService.reorder(actor, parsed.data);
    revalidateTaxonomy();
    return ok(undefined);
  });
}

/** 삭제 — **자료를 어디로 옮길지 함께 받습니다** (`FR-ADM-012` 수용 기준) */
export async function deleteCategoryAction(
  input: unknown
): Promise<ActionResult<{ moved: number }>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = z
      .object({ slug: slugSchema, moveTo: slugSchema.nullable() })
      .safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    const r = await categoryService.remove(actor, parsed.data.slug, parsed.data.moveTo);
    revalidateTaxonomy();
    // 자료의 분류가 바뀌었으므로 목록도 다시 그립니다
    revalidatePath("/resources");
    return ok(r);
  });
}

/* ── 태그 (`FR-ADM-013`) ────────────────────────────────────────────── */

export async function mergeTagsAction(
  input: unknown
): Promise<ActionResult<{ moved: number; merged: number }>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = z
      .object({ from: slugSchema, into: slugSchema })
      .safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    const r = await tagService.merge(actor, parsed.data.from, parsed.data.into);
    revalidateTaxonomy();
    revalidatePath("/resources");
    return ok(r);
  });
}

export async function renameTagAction(
  input: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = z
      .object({ slug: slugSchema, nextSlug: slugSchema, label: nameSchema })
      .safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    await tagService.rename(actor, parsed.data.slug, {
      slug: parsed.data.nextSlug,
      label: parsed.data.label,
    });
    revalidateTaxonomy();
    revalidatePath("/resources");
    return ok(undefined);
  });
}

export async function cleanupTagsAction(): Promise<
  ActionResult<{ removed: string[] }>
> {
  return guard(async () => {
    const actor = await requireActor();
    const r = await tagService.cleanup(actor);
    revalidateTaxonomy();
    return ok(r);
  });
}

export async function recountTagsAction(): Promise<
  ActionResult<{ fixed: number }>
> {
  return guard(async () => {
    const actor = await requireActor();
    const r = await tagService.recount(actor);
    revalidateTaxonomy();
    return ok(r);
  });
}

/**
 * 태그 자동완성 (`FR-SRCH-007`).
 *
 * **액션입니다.** 라우트 핸들러를 하나 더 두지 않는 이유는 이것이 화면
 * 전용이고 인가가 「로그인했는가」뿐이기 때문입니다 — CLI 는 `API-106`
 * (`taxonomy`)으로 같은 정보를 이미 받습니다.
 */
export async function suggestTagsAction(
  input: unknown
): Promise<ActionResult<tagService.TagRow[]>> {
  return guard(async () => {
    await requireActor();
    const parsed = z
      .object({
        q: z.string().max(50),
        exclude: z.array(z.string().max(50)).max(30).optional(),
      })
      .safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    const rows = await tagService.suggest(parsed.data.q, parsed.data.exclude ?? []);
    return ok(rows);
  });
}

/* ── 콘텐츠 타입 (`FR-ADM-014`) ─────────────────────────────────────── */

export async function updateTypeSettingsAction(
  input: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = z
      .array(
        z.object({
          code: z.string().min(1),
          isActive: z.boolean(),
          showInNav: z.boolean(),
        })
      )
      .min(1)
      .safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    await contentTypeService.updateSettings(
      actor,
      parsed.data as contentTypeService.TypeSettingInput[]
    );
    revalidateTaxonomy();
    revalidatePath("/resources");
    return ok(undefined);
  });
}

/* ── 시스템 설정 (`FR-ADM-015`) ─────────────────────────────────────── */

export async function updateSettingAction(
  input: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = settingUpdateSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    await settingsService.set(actor, parsed.data.key, parsed.data.value);
    revalidatePath("/admin/settings");
    revalidatePath("/admin");
    return ok(undefined);
  });
}

/* ── 유지보수 (`REQ-04 · 4.8`, `DEC-020`·`DEC-021`) ──────────────── */

/**
 * 밀린 스케줄 작업 + 보존 배치를 지금 돌린다.
 *
 * **`ADMIN` 입니다.** 저장소 수만큼 GitHub 을 부르고 30일 지난 자료를 실제로
 * 지웁니다 — 「지금 실행」이 가벼운 버튼이 아닙니다.
 *
 * 평소에는 Windows 작업 스케줄러가 `npm run maintenance` 로 부릅니다.
 * **같은 함수**를 지나므로 두 경로가 다른 판단을 하지 않습니다.
 */
export async function runMaintenanceAction(): Promise<
  ActionResult<maintenanceService.MaintenanceResult>
> {
  return guard(async () => {
    const actor = await requireAdminActor();
    const r = await maintenanceService.runDue(actor);
    revalidatePath("/admin/jobs");
    revalidatePath("/admin");
    return ok(r);
  });
}
