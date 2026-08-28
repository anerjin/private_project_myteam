import "server-only";

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import type { JobStatus } from "@/types";

/**
 * 수집 작업 모니터 (`SCR-241`).
 *
 * **워커는 `P6` 에서 붙습니다.** 그때까지 이 함수들은 빈 결과를 돌려주고,
 * 화면은 그 빈 상태를 그대로 그립니다 — 「P6 에서 붙습니다」 같은 안내문을
 * 하드코딩하면 「작업이 있는가」의 두 번째 출처가 되고, 워커가 붙은 날
 * 그 문장이 남습니다.
 *
 * page 가 아니라 여기 있는 이유는 `DEV-06 · 6.6` 입니다 — 화면이 Prisma 를
 * 부르면 `take: 50` 같은 값이 화면마다 갈리고, `P6` 가 상태 필터를 붙일 때
 * 고칠 곳을 화면에서 찾게 됩니다.
 */

const RECENT_LIMIT = 50;

const RECENT_INCLUDE = {
  resource: { select: { title: true } },
} satisfies Prisma.JobInclude;

/**
 * **행 모양을 손으로 적지 않습니다.** 처음엔 필드를 적어 뒀다가
 * `errorMessage`·`startedAt`·`finishedAt`·`requestedById` 를 빠뜨려 화면이
 * 컴파일되지 않았습니다 — 스키마와 «두 곳»이 되면 반드시 갈라집니다
 * (`resource.repository` 의 `RESOURCE_CARD_SELECT` 와 같은 방식으로 파생시킵니다).
 */
export type JobRow = Prisma.JobGetPayload<{ include: typeof RECENT_INCLUDE }>;

export interface JobBoard {
  /** 상태별 건수 — `groupBy` 한 번. 상태마다 세지 않는다 */
  counts: { status: JobStatus; n: number }[];
  recent: JobRow[];
}

const STATUSES: JobStatus[] = ["QUEUED", "RUNNING", "DONE", "FAILED"];

export async function board(): Promise<JobBoard> {
  const [grouped, recent] = await Promise.all([
    db.job.groupBy({ by: ["status"], _count: { _all: true } }),
    db.job.findMany({
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      include: RECENT_INCLUDE,
    }),
  ]);

  const byStatus = Object.fromEntries(
    grouped.map((g) => [g.status, g._count._all])
  );
  return {
    // 0건인 상태도 «자리를 지킵니다» — 안 그리면 「없는 것」과 「0인 것」이 같아 보인다
    counts: STATUSES.map((s) => ({ status: s, n: byStatus[s] ?? 0 })),
    recent,
  };
}
