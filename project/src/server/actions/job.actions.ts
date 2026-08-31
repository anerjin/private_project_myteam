"use server";

import { revalidatePath } from "next/cache";

import { AppError } from "@/lib/errors";
import { type ActionResult, guard, ok } from "@/lib/result";
import { requireAdminActor, requireRole } from "@/server/auth/guards";
import * as audit from "@/server/services/audit.service";
import * as jobService from "@/server/services/job.service";

/**
 * 작업 기록 관리 (`SCR-241`).
 *
 * 전에는 `retryJobAction` 만 `github.actions` 에 있었습니다 — 재실행은
 * GitHub 일이 아니라 **작업 일**이라 여기로 옮겼습니다. 삭제가 생기면서
 * 같은 대상을 만지는 액션이 두 파일에 흩어지게 되기 때문입니다.
 */

/**
 * 작업 재실행.
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
    // 옮겨 오면서 **가드를 바꾸지 않았습니다** — 옮기는 일이 동작을 바꾸면
    // 나중에 문제가 생겼을 때 「옮겨서인지 고쳐서인지」를 알 수 없습니다
    await requireRole("ADMIN");
    if (typeof jobId !== "string") {
      throw new AppError("VALIDATION_ERROR", "잘못된 요청입니다.");
    }
    /*
     * **기다리지 않습니다.** 500MB 아카이브 재실행이면 액션이 그동안 매달리고
     * (`NFR-PERF-006`), 버튼의 토스트 문구(「결과는 잠시 뒤 이 표에 반영됩니다」)와도
     * 어긋납니다. `enqueueAndRun` 과 같은 모양입니다.
     */
    void jobService.runNow(jobId).catch((e) => {
      console.error("[job] 재실행을 시작하지 못했습니다", jobId, e);
    });
    revalidatePath("/admin/jobs");
    // 성공하면 실패 건수가 줄어듭니다 — 홈의 배너도 그 숫자를 봅니다
    revalidatePath("/admin");
    return ok(undefined);
  });
}

/**
 * 기록 하나 삭제.
 *
 * **끝난 작업만입니다.** 대기·실행 중인 행을 지우면 그 일은 영영 안 돌고
 * 아무도 모릅니다 — 판정은 `job.service.isDeletable` 한 곳에 있습니다.
 *
 * 한 건 삭제는 **감사 로그에 남기지 않습니다.** 작업 기록은 운영 흔적이고,
 * 관리자가 실패한 줄 하나를 치울 때마다 감사 로그가 한 줄씩 늘면 정작
 * 봐야 할 계정·자료 기록이 묻힙니다. 일괄 정리는 남깁니다 — 그건 «몇 건이
 * 한꺼번에 사라졌는가»라 나중에 물어볼 만한 사실입니다.
 */
export async function deleteJobAction(
  jobId: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    await requireAdminActor();
    if (typeof jobId !== "string") {
      throw new AppError("VALIDATION_ERROR", "잘못된 요청입니다.");
    }
    await jobService.remove(jobId);
    revalidatePath("/admin/jobs");
    /*
     * **관리자 홈도 갱신합니다.** 「실패한 작업 N건」 배너가 거기 있습니다 —
     * 목록에서 지웠는데 홈이 옛 숫자를 계속 말하면 「하드코딩된 것 아니냐」가
     * 됩니다. 실제로 그런 질문을 받았습니다.
     */
    revalidatePath("/admin");
    return ok(undefined);
  });
}

/** 끝난 기록을 한 번에 정리. 지운 건수를 감사 로그에 남깁니다 */
export async function purgeJobsAction(): Promise<ActionResult<{ n: number }>> {
  return guard(async () => {
    const actor = await requireAdminActor();
    const n = await jobService.purgeFinished();
    if (n > 0) {
      await audit.logDetached(actor, {
        action: "JOB_PURGE",
        targetType: "job",
        summary: `끝난 작업 기록 ${n}건을 정리했습니다`,
      });
    }
    revalidatePath("/admin/jobs");
    // 관리자 홈의 「실패한 작업 N건」 배너도 같은 숫자를 봅니다
    revalidatePath("/admin");
    return ok({ n });
  });
}
