"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, guard, ok } from "@/lib/result";
import { requireActor } from "@/server/auth/guards";
import * as audit from "@/server/services/audit.service";

/**
 * 감사 로그 정리 (`SCR-251`).
 *
 * ## 조건은 «시점» 하나입니다
 *
 * 「이 사람의 기록만 지우기」·「이 행위만 지우기」를 만들지 않았습니다.
 * 그건 은폐에 딱 맞는 모양이고, 감사 로그가 존재하는 이유를 정면으로
 * 거스릅니다. 시점 기준은 보존 정책(`DEC-021` — 1년)과 같은 축이라
 * 「왜 지웠는가」에 답할 수 있습니다.
 *
 * ## 지운 사실은 남습니다
 *
 * 삭제와 기록이 `audit.purgeBefore` 안에서 **한 트랜잭션**입니다.
 * 자동 정리(`maintenance.service`)도 같은 함수를 씁니다.
 */

/**
 * 며칠 이전 기록을 지울지.
 *
 * **`0` 을 허용합니다** — 「전부 지우기」입니다. 오픈 전 검증 기록을 통째로
 * 치우는 일이 실제로 필요하고, 막아 두면 사람이 DB 로 내려갑니다(그러면
 * 지운 사실조차 안 남습니다). 대신 화면이 건수를 먼저 보여 주고 확인을 받습니다.
 */
const daysSchema = z.coerce.number().int().min(0).max(3650);

/** 몇 건이 지워질지 — 누르기 «전에» 보여 줍니다 */
export async function countAuditBeforeAction(
  days: unknown
): Promise<ActionResult<{ n: number; cutoff: string }>> {
  return guard(async () => {
    await requireActor();
    const d = daysSchema.parse(days);
    const cutoff = new Date(Date.now() - d * 24 * 60 * 60 * 1000);
    return ok({
      n: await audit.countBefore(cutoff),
      cutoff: cutoff.toISOString(),
    });
  });
}

export async function purgeAuditLogsAction(
  days: unknown
): Promise<ActionResult<{ n: number }>> {
  return guard(async () => {
    const actor = await requireActor();
    const d = daysSchema.parse(days);
    const cutoff = new Date(Date.now() - d * 24 * 60 * 60 * 1000);
    const n = await audit.purgeBefore(
      actor,
      cutoff,
      d === 0 ? "관리자가 전체 정리" : `관리자가 ${d}일 이전을 정리`
    );
    revalidatePath("/admin/audit-logs");
    return ok({ n });
  });
}
