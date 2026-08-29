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
  /**
   * 요청자 이름. **`jobs` 에 `User` 관계가 없어** 한 번 더 조회합니다 —
   * 관계를 넣으려면 마이그레이션이 필요하고, 화면 한 칸에 그 값은 크지 않습니다.
   * 원시 cuid 를 찍으면 관리자가 「누가 눌렀는지」를 알 수 없습니다.
   */
  requesterNames: Record<string, string>;
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

  const ids = [...new Set(recent.map((j) => j.requestedById).filter(Boolean))];
  const users = ids.length
    ? await db.user.findMany({
        where: { id: { in: ids as string[] } },
        select: { id: true, name: true },
      })
    : [];

  const byStatus = Object.fromEntries(
    grouped.map((g) => [g.status, g._count._all])
  );
  return {
    requesterNames: Object.fromEntries(users.map((u) => [u.id, u.name])),
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
/**
 * 동시에 도는 작업 수 상한.
 *
 * `P7` 의 CLI 가 10건을 한 번에 등록하면 `runNow` 10개가 동시에 뜨고
 * **아무도 세지 않습니다** — GitHub 한도를 한 번에 태우고 아카이브 여럿이
 * 같은 디스크에 씁니다. BullMQ 없이도 **상한 하나**면 됩니다.
 *
 * `DEC-053` 이 「다시 볼 시점」으로 적은 자리가 여기인데, 구조를 바꿀 필요가
 * 없었습니다 — 실행하는 자리를 이미 한 곳(`runNow`)으로 모아 뒀기 때문입니다.
 */
const MAX_CONCURRENT = 2;
let running = 0;
const waiting: (() => void)[] = [];

async function acquire(): Promise<void> {
  if (running < MAX_CONCURRENT) {
    running++;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
}

function release(): void {
  running--;
  waiting.shift()?.();
}

export async function enqueueAndRun(
  input: Parameters<typeof enqueue>[0]
): Promise<{ id: string }> {
  const job = await enqueue(input);
  /*
   * **`.catch()` 가 반드시 있어야 합니다.** `runNow` 는 자기 안에서 오류를
   * `jobs` 행에 적지만, **그 적는 일 자체가 실패**하면(DB 가 잠깐 끊기면)
   * 처리되지 않은 거부가 됩니다 — Node 는 기본값으로 **프로세스를 죽입니다.**
   * `DEC-053` 이 「프로세스 하나」에 기대는 결정이라 그 하나가 죽으면 안 됩니다.
   */
  void runNow(job.id).catch((e) => {
    console.error("[job] 실행을 시작하지 못했습니다", job.id, e);
  });
  return job;
}

/**
 * **버려진 작업**으로 보는 시간.
 *
 * `DEC-053` 이 「PC 가 꺼지면 `RUNNING` 이 남고 사람이 재실행한다」고 적었는데
 * **그 상태를 집는 코드가 없었습니다** — `QUEUED`·`FAILED` 만 집었으므로
 * 정확히 그 경우에 할 수 있는 일이 하나도 없었습니다. 결정의 「잃는 것」 칸이
 * 거짓이었던 셈입니다.
 *
 * 살아 있는 실행과 겹치지 않게 **시작한 지 오래된 것만** 집습니다.
 * 가장 긴 작업이 500MB 아카이브라 30분이면 넉넉합니다.
 */
const STALE_AFTER_MS = 30 * 60 * 1000;

/** 지금 다시 실행할 수 있는 상태인가 — 화면과 서비스가 **같은 판정**을 쓴다 */
export function isRetryable(job: {
  status: JobStatus;
  startedAt: Date | null;
}): boolean {
  if (job.status === "QUEUED" || job.status === "FAILED") return true;
  if (job.status !== "RUNNING") return false;
  return (
    job.startedAt !== null &&
    Date.now() - job.startedAt.getTime() > STALE_AFTER_MS
  );
}

/**
 * 한 작업을 지금 실행한다. **관리자의 「재실행」도 이 함수입니다.**
 *
 * 「돌고 있는 것」을 두 번 돌리면 아카이브가 같은 파일에 동시에 씁니다.
 * 그래서 `RUNNING` 은 **버려진 것만** 집습니다(`STALE_AFTER_MS`).
 * `updateMany` 의 **갱신 건수**로 판정하므로 두 요청이 동시에 와도 하나만
 * 통과합니다 — 조건을 코드가 아니라 `where` 에 두는 것이 그 이유입니다.
 */
export async function runNow(jobId: string): Promise<void> {
  await acquire();
  try {
    await runClaimed(jobId);
  } finally {
    release();
  }
}

async function runClaimed(jobId: string): Promise<void> {
  const stale = new Date(Date.now() - STALE_AFTER_MS);
  const claimed = await db.job.updateMany({
    where: {
      id: jobId,
      OR: [
        { status: { in: ["QUEUED", "FAILED"] } },
        { status: "RUNNING", startedAt: { lt: stale } },
      ],
    },
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
