import "server-only";

import type { Prisma } from "@prisma/client";

import { OPERATIONAL } from "@/features/resources/content-types/operational";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import * as notify from "@/server/services/notification.service";
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

/* ── 기록 정리 (`SCR-241`) ────────────────────────────────────────── */

/**
 * 지울 수 있는 상태인가 — **끝난 것만** 지웁니다.
 *
 * `QUEUED`·`RUNNING` 을 지우는 것은 «취소»이지 «기록 삭제»가 아닙니다.
 * 대기 중인 행을 지우면 그 일은 **영영 안 돌고 아무도 모릅니다** — 아카이브
 * 요청이 조용히 사라지는 형태입니다. `isRetryable` 과 같은 이유로 판정을
 * 여기 한 곳에 둡니다: 화면이 `status === "DONE"` 을 손으로 적으면
 * 상태가 늘어난 날 한쪽만 고쳐집니다.
 */
export function isDeletable(job: { status: JobStatus }): boolean {
  return job.status === "DONE" || job.status === "FAILED";
}

/** 기록 하나를 지운다. 끝나지 않은 작업이면 거절한다 */
export async function remove(jobId: string): Promise<void> {
  const job = await db.job.findUnique({
    where: { id: jobId },
    select: { id: true, status: true },
  });
  if (!job) throw new AppError("NOT_FOUND", "작업 기록을 찾을 수 없습니다.");
  if (!isDeletable(job)) {
    throw new AppError(
      "INVALID_STATE",
      "끝난 작업만 지울 수 있습니다. 대기·실행 중인 작업은 재실행으로 처리하십시오."
    );
  }
  await db.job.delete({ where: { id: jobId } });
}

/** 지울 수 있는 기록이 몇 건인지 — 버튼이 «몇 건 지울지» 말하려면 필요합니다 */
export async function countDeletable(): Promise<number> {
  return db.job.count({ where: { status: { in: ["DONE", "FAILED"] } } });
}

/**
 * 끝난 기록을 한 번에 지운다.
 *
 * **대기·실행 중인 것은 건드리지 않습니다** — `isDeletable` 과 같은 조건을
 * `where` 에 둡니다. 코드로 거르고 지우면 그 사이에 상태가 바뀐 행이 섞입니다.
 */
export async function purgeFinished(): Promise<number> {
  const { count } = await db.job.deleteMany({
    where: { status: { in: ["DONE", "FAILED"] } },
  });
  return count;
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
    select: {
      id: true,
      type: true,
      resourceId: true,
      payload: true,
      // 누구에게 알릴지 (`FR-NOTI-004`) — 요청자가 없는 배치 작업도 있다
      requestedById: true,
    },
  });
  if (!job) return;

  const handler = HANDLERS.get(job.type);
  if (!handler) {
    const message = `처리기가 등록되지 않은 작업입니다: ${job.type}`;
    await db.job.update({
      where: { id: jobId },
      data: { status: "FAILED", finishedAt: new Date(), errorMessage: message },
    });
    await announce(job, "FAILED", message);
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
    await announce(job, "DONE");
  } catch (e) {
    /*
     * **오류 문구를 그대로 남깁니다.** `admin/jobs` 가 그것을 보여주고,
     * 사람이 「다시 눌러야 하는가」를 판단합니다 — rate limit 이면 기다리면
     * 되고, 저장소가 사라졌으면 눌러도 소용없습니다.
     */
    const message = e instanceof Error ? e.message : String(e);
    await db.job.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: message,
        attempts: { increment: 1 },
      },
    });
    await announce(job, "FAILED", message);
  }
}

/**
 * 작업 완료·실패 알림 (`FR-NOTI-004`).
 *
 * ## 왜 필요한가
 *
 * 아카이브는 **최대 500MB 를 받습니다.** 걸어 놓고 끝났는지 알 방법이
 * 관리자 화면을 계속 새로고침하는 것뿐이었습니다 — `JOB_DONE`·`JOB_FAILED`
 * 알림 타입은 `P1` 부터 있었는데 **아무도 만들지 않았습니다.**
 *
 * ## 요청자가 없으면 안 보냅니다
 *
 * 스케줄 작업(`CLEANUP_TRASH` 등)은 사람이 시킨 것이 아닙니다. 「휴지통을
 * 정리했습니다」를 매일 받으면 알림함이 그것으로 찹니다 — 그런 것은
 * `admin/jobs` 가 보여줍니다.
 *
 * 다만 **배치가 실패하면** 알립니다. 요청자가 없어도 관리자는 알아야 합니다.
 *
 * ## 실패해도 작업 결과를 뒤집지 않습니다
 *
 * `notify` 가 이미 자기 안에서 삼킵니다(`notification.service`) — 알림을 못
 * 남겼다고 성공한 아카이브를 실패로 만들 이유가 없습니다.
 */
async function announce(
  job: {
    id: string;
    type: JobType;
    resourceId: string | null;
    requestedById: string | null;
  },
  status: "DONE" | "FAILED",
  error?: string
): Promise<void> {
  const label = JOB_LABEL[job.type] ?? job.type;

  if (!job.requestedById) {
    // 사람이 시키지 않은 배치 — **실패했을 때만** 관리자에게
    if (status === "FAILED") {
      await notify.notifyEveryone({
        type: "JOB_FAILED",
        title: `${label} 작업이 실패했습니다`,
        body: error?.slice(0, 200),
        linkUrl: "/admin/jobs",
      });
    }
    return;
  }

  /*
   * **자료로 바로 갈 수 있게 합니다.** 「아카이브가 끝났습니다」만 오면
   * 사용자는 그 자료를 다시 찾아야 합니다 — 링크가 알림의 절반입니다.
   */
  const link = job.resourceId
    ? await resourceLink(job.resourceId)
    : "/admin/jobs";

  await notify.notify({
    userId: job.requestedById,
    type: status === "DONE" ? "JOB_DONE" : "JOB_FAILED",
    title:
      status === "DONE"
        ? `${label} 작업이 끝났습니다`
        : `${label} 작업이 실패했습니다`,
    body: status === "FAILED" ? error?.slice(0, 200) : undefined,
    linkUrl: link,
  });
}

/** 사람이 읽는 작업 이름 — 알림 문구가 `ARCHIVE_GITHUB` 라고 말하면 안 된다 */
const JOB_LABEL: Partial<Record<JobType, string>> = {
  FETCH_URL_META: "URL 정보 수집",
  FETCH_GITHUB_META: "GitHub 메타 수집",
  ARCHIVE_GITHUB: "소스 아카이브",
  ARCHIVE_URL: "웹 페이지 보관",
  REFRESH_GITHUB_META: "저장소 메타 갱신",
  CHECK_LINK: "원본 링크 확인",
  GENERATE_THUMBNAIL: "썸네일 생성",
  CLEANUP_TRASH: "휴지통 정리",
};

/**
 * 자료 주소.
 *
 * ## `content-types/index` 를 부르면 안 됩니다
 *
 * 처음에 `getContentType()` 을 썼다가 **`npm run maintenance` 가 죽었습니다**:
 *
 * ```
 * TypeError: react.createContext is not a function
 *   at lucide-react/src/context.ts
 *   at content-types/ai-material/meta.ts
 * ```
 *
 * 레지스트리는 `Card`·`Detail`·`Form`(React 컴포넌트)과 `lucide` 아이콘을
 * 알고 있어서, service 가 그것을 부르면 **화면 컴포넌트가 서버 그래프에
 * 들어옵니다.** Next 안에서는 티가 안 나지만 **React 가 없는 프로세스**
 * (배치 스크립트·검증 스크립트)에서는 그 자리에서 터집니다.
 *
 * `operational.ts` 가 정확히 그 이유로 있습니다 — `content-type.service` 의
 * 주석이 이미 경고하고 있었고, 저는 그것을 읽고도 같은 실수를 했습니다.
 *
 * 못 찾으면 작업 화면으로 보냅니다 — **죽은 링크를 보내지 않습니다.**
 */
async function resourceLink(resourceId: string): Promise<string> {
  const r = await db.resource.findUnique({
    where: { id: resourceId },
    select: { slug: true, type: true },
  });
  if (!r) return "/admin/jobs";
  return `/resources/${OPERATIONAL[r.type].slug}/${r.slug}`;
}
