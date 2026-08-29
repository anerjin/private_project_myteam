"use server";

import { revalidatePath } from "next/cache";

import { AppError } from "@/lib/errors";
import { guard, ok, type ActionResult } from "@/lib/result";
import { canEditResource } from "@/server/auth/actor";
import { requireActor, requireRole } from "@/server/auth/guards";
import { db } from "@/lib/db";
// **이 import 가 「워커를 켜는 것」입니다** (`DEC-053`) — 없으면 처리기가 등록되지 않는다
import "@/server/jobs";
import * as jobService from "@/server/services/job.service";

/**
 * GitHub 수집 액션 (`FR-GH-001`·`003`·`005`).
 *
 * **셋 다 작업을 만들고 바로 돌아옵니다.** 메타 수집은 GitHub 이 느릴 수 있고
 * 아카이브는 최대 500MB 라 요청 안에서 끝낼 수 없습니다 (`NFR-PERF-006`).
 * 진행 상황은 `jobs` 행에 남고 `admin/jobs` 가 보여줍니다.
 */

/** 대상 자료를 고칠 수 있는가 — 셋이 같은 판정을 쓴다 */
async function requireEditable(resourceId: string) {
  const actor = await requireActor();
  const target = await db.resource.findFirst({
    where: { id: resourceId, deletedAt: null },
    select: { id: true, authorId: true, type: true },
  });
  if (!target) throw new AppError("NOT_FOUND", "자료를 찾을 수 없습니다.");
  if (target.type !== "GITHUB_REPO") {
    throw new AppError("INVALID_STATE", "GitHub 저장소 자료가 아닙니다.");
  }
  if (!canEditResource(actor, target.authorId)) {
    throw new AppError("FORBIDDEN", "이 자료를 수정할 권한이 없습니다.");
  }
  return actor;
}

/** API-030 저장소 메타 재수집 (`FR-GH-005`) */
export async function refreshGithubMetaAction(
  resourceId: unknown
): Promise<ActionResult<{ jobId: string }>> {
  return guard(async () => {
    if (typeof resourceId !== "string") {
      throw new AppError("VALIDATION_ERROR", "잘못된 요청입니다.");
    }
    const actor = await requireEditable(resourceId);
    const job = await jobService.enqueueAndRun({
      type: "REFRESH_GITHUB_META",
      resourceId,
      requestedById: actor.id,
    });
    return ok({ jobId: job.id });
  });
}

/** API-031 아카이브 실행 (`FR-GH-003`) — **선택 실행**입니다 (`DEC-022`) */
export async function startArchiveAction(
  resourceId: unknown
): Promise<ActionResult<{ jobId: string }>> {
  return guard(async () => {
    if (typeof resourceId !== "string") {
      throw new AppError("VALIDATION_ERROR", "잘못된 요청입니다.");
    }
    const actor = await requireEditable(resourceId);
    const job = await jobService.enqueueAndRun({
      type: "ARCHIVE_GITHUB",
      resourceId,
      requestedById: actor.id,
    });
    return ok({ jobId: job.id });
  });
}

/**
 * 작업 재실행 (`SCR-241`).
 *
 * **`DEC-053` 의 재시도가 이것입니다.** BullMQ 의 자동 백오프가 없으므로
 * 사람이 누릅니다 — `admin/jobs` 가 오류 문구를 함께 보여주므로 「눌러도
 * 소용없는 실패」(저장소 삭제)와 「기다리면 되는 실패」(rate limit)를 구별할 수
 * 있습니다.
 */
export async function retryJobAction(
  jobId: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    await requireRole("ADMIN");
    if (typeof jobId !== "string") {
      throw new AppError("VALIDATION_ERROR", "잘못된 요청입니다.");
    }
    await jobService.runNow(jobId);
    revalidatePath("/admin/jobs");
    return ok(undefined);
  });
}
