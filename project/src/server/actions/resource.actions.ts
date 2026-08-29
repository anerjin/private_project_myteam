"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { parseResourceInput } from "@/features/resources/form.schema";
import { AppError } from "@/lib/errors";
import { guard, ok, validationError, type ActionResult } from "@/lib/result";
import { getSession, requireActor } from "@/server/auth/guards";
// 이 import 가 작업 처리기를 등록합니다 (`DEC-053`)
import "@/server/jobs";
import * as jobService from "@/server/services/job.service";
import * as resourceService from "@/server/services/resource.service";
import * as resourceWrite from "@/server/services/resource.write";

/**
 * 자료 액션 (DEV-05 · 5.5절).
 *
 * 5단계 (`DEC-038`) — 인가 → 검증 → 소유권 → service → 캐시 무효화.
 * 감사 로그는 service 가 남깁니다.
 */

const idSchema = z.string().min(1).max(40);

/**
 * API-031 자료 등록 (FR-RES-004).
 *
 * **여기가 「관통」의 마지막 마디입니다** — 폼 → zod(`form.schema` + 타입 폴더의
 * `schema.ts`) → service → Prisma 상세 테이블. `DEV-07 · 7.4` 가
 * *"`M0.5` 는 화면 쪽만 증명했다"* 고 못 박은 그 경로입니다.
 */
export async function createResourceAction(
  input: unknown
): Promise<ActionResult<resourceWrite.WriteResult>> {
  return guard(async () => {
    const actor = await requireActor();

    const parsed = parseResourceInput(input);
    if (!parsed.ok) {
      throw new AppError(
        "VALIDATION_ERROR",
        "입력값을 확인해 주세요.",
        parsed.fieldErrors
      );
    }

    const result = await resourceWrite.create(actor, parsed.data);

    /*
     * **「URL 하나로 등록하면 메타데이터가 자동으로 채워진다」** (`REQ-01 · 1.2`).
     *
     * 작업을 만들고 **기다리지 않습니다** — GitHub 이 느리면 등록이 매달립니다
     * (`NFR-PERF-006`). 사용자는 바로 상세로 가고, 스타·언어·README 는 잠시 뒤
     * 채워집니다. 실패는 `jobs` 행에 남아 `admin/jobs` 가 보여줍니다.
     *
     * **아카이브는 여기서 하지 않습니다** — `DEC-022` 가 「선택 실행」으로
     * 정했습니다. 등록마다 받으면 개발 PC 디스크가 며칠 만에 찹니다.
     */
    if (result.type === "GITHUB_REPO") {
      await jobService.enqueueAndRun({
        type: "FETCH_GITHUB_META",
        resourceId: result.id,
        requestedById: actor.id,
      });
    }

    revalidatePath("/resources");
    revalidatePath("/search");
    return ok(result);
  });
}

/** API-032 자료 수정 (FR-RES-006) */
export async function updateResourceAction(
  id: unknown,
  input: unknown
): Promise<ActionResult<resourceWrite.WriteResult>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) return validationError(parsedId.error);

    const parsed = parseResourceInput(input);
    if (!parsed.ok) {
      throw new AppError(
        "VALIDATION_ERROR",
        "입력값을 확인해 주세요.",
        parsed.fieldErrors
      );
    }

    // 소유권은 service 가 본다 (데이터를 봐야 알 수 있으므로)
    const result = await resourceWrite.update(
      actor,
      parsedId.data,
      parsed.data
    );

    revalidatePath("/resources");
    revalidatePath(`/resources/${result.slug}`);
    return ok(result);
  });
}

/**
 * URL 중복 확인 (FR-RES-011).
 *
 * **등록을 막지 않습니다** — 화면이 「이미 있습니다」를 보여주고 사람이 판단합니다.
 * 막으면 사람이 URL 을 살짝 바꿔 우회하고, 그러면 중복 감지 자체가 무의미해집니다.
 */
export async function checkDuplicateAction(
  url: unknown
): Promise<ActionResult<resourceWrite.DuplicateHint | null>> {
  return guard(async () => {
    await requireActor();
    if (typeof url !== "string") return ok(null);
    return ok(await resourceWrite.findDuplicate(url));
  });
}

/** API-034 북마크 토글 (`FR-COLL-001`) */
export async function toggleBookmarkAction(
  resourceId: unknown
): Promise<ActionResult<resourceService.BookmarkResult>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = idSchema.safeParse(resourceId);
    if (!parsed.success) return validationError(parsed.error);

    const result = await resourceService.toggleBookmark(actor, parsed.data);

    revalidatePath("/bookmarks");
    return ok(result);
  });
}

/**
 * 조회수 (`FR-RES-014`).
 *
 * **인가가 «있지만 느슨합니다»** — 로그인한 사람이면 됩니다.
 * 자료는 로그인만 하면 누구나 볼 수 있으므로(`DEC-018`) 그 이상 좁힐 근거가 없고,
 * 비로그인 호출은 막습니다(액션은 공개 엔드포인트라 카운터 조작을 열어 둘 이유가 없습니다).
 *
 * **`revalidatePath` 를 부르지 않습니다.** 조회수 하나로 페이지를 다시 그리면
 * 보는 사람마다 캐시가 깨집니다 — 다음 자연스러운 갱신에 반영되면 충분합니다.
 */
export async function countViewAction(
  resourceId: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    const session = await getSession();
    if (!session) return ok(undefined);
    const parsed = idSchema.safeParse(resourceId);
    if (!parsed.success) return validationError(parsed.error);

    // 「누가」를 넘겨야 같은 사람의 재방문을 걸러낼 수 있다 (`FR-RES-014`)
    await resourceService.countView(parsed.data, session.userId);
    return ok(undefined);
  });
}

/** API-033 자료 삭제 — 소프트 삭제 (`FR-RES-007`) */
export async function deleteResourceAction(
  resourceId: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = idSchema.safeParse(resourceId);
    if (!parsed.success) return validationError(parsed.error);

    // 소유권은 service 가 본다 (데이터를 봐야 알 수 있으므로 — actor.ts)
    await resourceService.remove(actor, parsed.data);

    revalidatePath("/resources");
    revalidatePath("/bookmarks");
    return ok(undefined);
  });
}
