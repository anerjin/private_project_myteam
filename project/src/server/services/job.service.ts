import "server-only";

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import type { JobStatus, JobType } from "@/types";

/**
 * 수집 작업 (`SCR-241`, `DEC-053`).
 *
 * ## 별도 워커 프로세스가 없습니다
 *
 * `jobs` 테이블이 **상태의 정본**이고, 액션이 행을 만든 뒤 응답을 돌려주고
 * **같은 프로세스가 이어서** 처리합니다 (`DEC-053`). 규모가 동시 20명·자료
 * 200건이라 큐 4개와 워커 프로세스는 그 규모의 구조가 아닙니다.
 *
 * ## 그래도 **만드는 자리와 실행하는 자리를 나눕니다**
 *
 * `enqueue()` 는 행만 만들고, `runNow()` 가 실행합니다. 나중에 BullMQ 로
 * 옮기게 되면 **바꿀 것이 그 둘 사이뿐**입니다 — `enqueue` 가 큐에 넣고
 * 워커가 `runNow` 를 부릅니다. `DEC-053` 의 「다시 볼 시점」이 그 뜻입니다.
 *
 * ## 잃는 것
 *
 * PC 가 꺼지면 `RUNNING` 인 행이 그대로 남습니다. `admin/jobs` 가 그 행을
 * 보여주고 **사람이 재실행**합니다 — 안 보이게 숨기지 않습니다.
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

/** 작업 하나가 하는 일. `runNow` 가 이 표를 조회한다 — 분기가 아니라 표다 */
export type JobHandler = (job: {
  id: string;
  resourceId: string | null;
  payload: Prisma.JsonValue;
}) => Promise<Prisma.InputJsonValue | void>;

const HANDLERS = new Map<JobType, JobHandler>();

/**
 * 처리기를 등록한다.
 *
 * **`job.service` 가 GitHub·파일을 알지 않게** 하려고 뒤집었습니다. 서비스는
 * 「작업이 있고, 상태가 있고, 실행한다」만 알고 **무엇을 하는지는 등록하는 쪽**
 * 이 압니다 — 안 그러면 이 파일이 `P6`·`P7` 이 지날 때마다 자랍니다.
 */
export function register(type: JobType, handler: JobHandler): void {
  HANDLERS.set(type, handler);
}

/** 작업을 만든다. **실행은 하지 않는다** — 그 둘을 나눠 두는 것이 `DEC-053` 의 핵심 */
export async function enqueue(input: {
  type: JobType;
  resourceId?: string;
  payload?: Prisma.InputJsonValue;
  requestedById?: string;
}): Promise<{ id: string }> {
  return db.job.create({
    data: {
      type: input.type,
      resourceId: input.resourceId ?? null,
      payload: input.payload,
      requestedById: input.requestedById ?? null,
    },
    select: { id: true },
  });
}

/**
 * 만들고 **응답 뒤에 이어서 돌린다.**
 *
 * `void` 로 띄우고 기다리지 않습니다 — 그래야 액션이 바로 돌아갑니다
 * (`NFR-PERF-006`: 외부 API 를 요청 스레드에서 3초 넘게 기다리지 않는다).
 * 실패는 `jobs` 행에 남으므로 **삼켜지지 않습니다.**
 */
export async function enqueueAndRun(
  input: Parameters<typeof enqueue>[0]
): Promise<{ id: string }> {
  const job = await enqueue(input);
  void runNow(job.id);
  return job;
}

/**
 * 한 작업을 지금 실행한다. **관리자의 「재실행」도 이 함수입니다.**
 *
 * `QUEUED` 나 `FAILED` 만 집습니다 — 이미 돌고 있는 것을 두 번 돌리면
 * 아카이브가 같은 파일에 동시에 쓰게 됩니다. `updateMany` 의 **갱신 건수**로
 * 판정하므로 두 요청이 동시에 와도 하나만 통과합니다.
 */
export async function runNow(jobId: string): Promise<void> {
  const claimed = await db.job.updateMany({
    where: { id: jobId, status: { in: ["QUEUED", "FAILED"] } },
    data: { status: "RUNNING", startedAt: new Date(), errorMessage: null },
  });
  if (claimed.count === 0) return;

  const job = await db.job.findUnique({
    where: { id: jobId },
    select: { id: true, type: true, resourceId: true, payload: true },
  });
  if (!job) return;

  const handler = HANDLERS.get(job.type);
  if (!handler) {
    await db.job.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: `처리기가 등록되지 않은 작업입니다: ${job.type}`,
      },
    });
    return;
  }

  try {
    const result = await handler(job);
    await db.job.update({
      where: { id: jobId },
      data: {
        status: "DONE",
        finishedAt: new Date(),
        result: result ?? undefined,
        attempts: { increment: 1 },
      },
    });
  } catch (e) {
    /*
     * **오류 문구를 그대로 남깁니다.** `admin/jobs` 가 그것을 보여주고,
     * 사람이 「다시 눌러야 하는가」를 판단합니다 — rate limit 이면 기다리면
     * 되고, 저장소가 사라졌으면 눌러도 소용없습니다.
     */
    await db.job.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: e instanceof Error ? e.message : String(e),
        attempts: { increment: 1 },
      },
    });
  }
}
