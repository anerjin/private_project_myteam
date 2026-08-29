"use server";

import { revalidatePath } from "next/cache";

import { AppError } from "@/lib/errors";
import { guard, ok, type ActionResult } from "@/lib/result";
import { requireActor } from "@/server/auth/guards";
import * as fileService from "@/server/services/file.service";

/**
 * API-043 첨부 삭제 (`FR-FILE-003`).
 *
 * **업로드는 액션이 아니라 라우트입니다** (`/api/files`) — Server Action 은
 * 인자를 직렬화해 넘기므로 파일 전체가 메모리에 올라갑니다 (`NFR-PERF-007`).
 * 삭제는 id 하나라 액션이 맞습니다.
 */
export async function detachFileAction(
  fileId: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    const actor = await requireActor();
    if (typeof fileId !== "string" || !fileId) {
      throw new AppError("VALIDATION_ERROR", "잘못된 요청입니다.");
    }
    await fileService.detach(actor, fileId);
    revalidatePath("/resources");
    return ok(undefined);
  });
}
