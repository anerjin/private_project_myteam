import "server-only";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import type { Actor } from "@/server/auth/actor";
import * as audit from "@/server/services/audit.service";
import * as jobService from "@/server/services/job.service";
import * as memberService from "@/server/services/member.service";
import * as settingsService from "@/server/services/settings.service";
import * as storageService from "@/server/services/storage.service";

/**
 * 스케줄 작업과 보존 배치 (`REQ-04 · 4.8`, `DEC-020`·`DEC-021`·`DEC-053`).
 *
 * ## 크론이 없습니다. **부르면 도는 함수**입니다
 *
 * `DEC-053` 이 별도 워커 프로세스를 두지 않기로 했습니다. 그래서 여기에
 * `setInterval` 도 스케줄러 라이브러리도 없습니다 — 대신 **「지금 밀린 것을
 * 돌려라」** 하나를 두고 두 곳에서 부릅니다:
 *
 * - 관리자 화면의 「지금 실행」 버튼
 * - `npm run maintenance` — Windows 작업 스케줄러가 하루 한 번 부릅니다
 *   (백업이 이미 그 스케줄러를 씁니다 — `NFR-BACKUP-005`)
 *
 * **밀린 것을 계산하는 쪽이 한 곳**이므로 두 경로가 다른 판단을 하지 않습니다.
 *
 * ## 「언제 마지막으로 돌았나」는 `jobs` 테이블이 압니다
 *
 * 별도의 `schedules` 테이블을 두지 않습니다. `jobs` 에 **그 유형의 마지막
 * `DONE`** 이 있고, 그것이 곧 마지막 실행 시각입니다 — 상태의 정본을 둘로
 * 나누면 「돌았다고 적혀 있는데 작업 기록은 없는」 상태가 생깁니다.
 *
 * ## 두 프로세스가 같이 돌아도 안전합니다
 *
 * CLI 와 화면이 동시에 부를 수 있습니다. 작업을 집는 것은
 * `job.service.runClaimed` 의 `updateMany`(원자적)라 **둘 중 하나만** 집습니다.
 */

/** 스케줄 주기 — `REQ-04 · 4.8` 의 표 그대로 */
const EVERY = {
  REFRESH_GITHUB_META: 7 * 24 * 60 * 60 * 1000, // 주 1회
  CHECK_LINK: 30 * 24 * 60 * 60 * 1000, // 월 1회
  CLEANUP_TRASH: 24 * 60 * 60 * 1000, // 일 1회
} as const;

type ScheduledType = keyof typeof EVERY;

const SCHEDULED: ScheduledType[] = [
  "REFRESH_GITHUB_META",
  "CHECK_LINK",
  "CLEANUP_TRASH",
];

export interface ScheduleRow {
  type: ScheduledType;
  lastRunAt: Date | null;
  nextDueAt: Date | null;
  due: boolean;
}

/**
 * 각 스케줄이 언제 돌았고 언제 돌 차례인가.
 *
 * **한 번도 안 돈 것은 «밀린 것»입니다.** 「아직 때가 아니다」로 두면 처음
 * 켠 시스템에서 영원히 안 돕니다.
 */
export async function schedules(): Promise<ScheduleRow[]> {
  const rows = await Promise.all(
    SCHEDULED.map(async (type) => {
      const last = await db.job.findFirst({
        where: { type, status: "DONE" },
        orderBy: { finishedAt: "desc" },
        select: { finishedAt: true },
      });
      const lastRunAt = last?.finishedAt ?? null;
      const nextDueAt = lastRunAt
        ? new Date(lastRunAt.getTime() + EVERY[type])
        : null;
      return {
        type,
        lastRunAt,
        nextDueAt,
        due: nextDueAt === null || nextDueAt.getTime() <= Date.now(),
      };
    })
  );
  return rows;
}

export interface MaintenanceResult {
  /** 큐에 넣은 스케줄 작업 */
  queued: ScheduledType[];
  /** 건너뛴 것 — 아직 때가 아니거나 이미 돌고 있음 */
  skipped: ScheduledType[];
  retention: RetentionResult;
  disk: { freeGb: number; ok: boolean };
  archive: { bytes: number; warn: boolean; full: boolean };
}

/**
 * 밀린 스케줄을 돌리고 보존 배치를 실행한다.
 *
 * **이미 대기·실행 중인 같은 유형은 다시 넣지 않습니다.** 스케줄러가 하루
 * 한 번 부르는데 앞의 작업이 아직 안 끝났으면, 넣는 만큼 쌓입니다.
 */
export async function runDue(actor: Actor): Promise<MaintenanceResult> {
  const queued: ScheduledType[] = [];
  const skipped: ScheduledType[] = [];

  for (const s of await schedules()) {
    if (!s.due) {
      skipped.push(s.type);
      continue;
    }
    const inFlight = await db.job.count({
      where: { type: s.type, status: { in: ["QUEUED", "RUNNING"] } },
    });
    if (inFlight > 0) {
      skipped.push(s.type);
      continue;
    }
    await jobService.enqueueAndRun({ type: s.type, requestedById: actor.id });
    queued.push(s.type);
  }

  const retention = await runRetention(actor);

  /*
   * **디스크·아카이브는 «작업»이 아니라 확인입니다** (`P6` 가 둔 하나).
   * 큐에 넣을 것이 없고, 결과는 화면이 바로 보여줍니다.
   */
  const usage = await storageService.usage();
  const minFree = await settingsService.minFreeGb();

  return {
    queued,
    skipped,
    retention,
    disk: { freeGb: usage.disk.freeGb, ok: usage.disk.freeGb >= minFree },
    archive: {
      bytes: usage.archive.bytes,
      warn: usage.archive.warn,
      full: usage.archive.full,
    },
  };
}

/* ── 보존 배치 (`DEC-021`·`DEC-020`) ──────────────────────────────── */

/** 탈퇴 계정 익명화·감사 로그 보존 — 둘 다 **1년** (`DEC-021`) */
const RETAIN_MS = 365 * 24 * 60 * 60 * 1000;

/** 토큰 만료 경고를 띄우기 시작하는 시점 (`DEC-020` — 만료 1년 PAT) */
const TOKEN_WARN_DAYS = 30;

export interface RetentionResult {
  anonymized: number;
  auditLogsRemoved: number;
  /** API 키 만료가 임박한 건수 — 관리자에게 보여줄 숫자 */
  keysExpiringSoon: number;
  /** `GITHUB_TOKEN` 이 없다 — 한도가 시간당 60회로 떨어져 있다 */
  githubTokenMissing: boolean;
}

/*
 * **익명화 본체는 `member.service` 에 있습니다.**
 *
 * `users` 쓰기는 `member.service`·`user.repository`·`auth.service` 셋만
 * 합니다 (`DEC-036`·`DEC-044`) — 여기서 직접 쓰다가 `check-deps` 에 막혔고,
 * 그 규칙이 옳습니다. 계정의 «생애»를 아는 파일이 하나여야 상태 전이와
 * 익명화가 서로 모르는 일이 안 생깁니다.
 *
 * 이 파일은 **언제 돌릴지**를 알고, 그쪽은 **무엇을 할지**를 압니다.
 */
/**
 * 1년 지난 감사 로그 정리 (`DEC-021` — 보존 1년).
 *
 * **삭제한 건수를 다시 감사 로그에 남깁니다.** 「왜 작년 기록이 없느냐」의
 * 답이 있어야 하고, 그 답 자체가 첫 줄이 됩니다.
 */
async function pruneAuditLogs(actor: Actor): Promise<number> {
  const cutoff = new Date(Date.now() - RETAIN_MS);
  const { count } = await db.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  if (count > 0) {
    await db.$transaction(async (tx) => {
      await audit.log(
        actor,
        {
          action: "SETTING_UPDATE",
          targetType: "audit_log",
          summary: `감사 로그 정리 — ${count}건 (보존 1년 경과)`,
          diff: { cutoff: { before: "-", after: cutoff.toISOString() } },
        },
        tx
      );
    });
  }
  return count;
}

/**
 * **읽기만** 하는 보존 상태 — 화면이 부릅니다.
 *
 * `runRetention` 은 익명화하고 로그를 지웁니다. **페이지 렌더가 그것을
 * 부르면 새로고침이 데이터를 바꿉니다** — 「보기만 했는데 뭔가 사라졌다」가
 * 되고, 크롤러나 프리페치가 그 일을 대신 해 줍니다.
 * 그래서 보여줄 숫자만 세는 함수를 따로 둡니다.
 */
export async function retentionStatus(): Promise<{
  keysExpiringSoon: number;
  githubTokenMissing: boolean;
  anonymizeDue: number;
}> {
  const cutoff = new Date(Date.now() - RETAIN_MS);
  const [keysExpiringSoon, anonymizeDue] = await Promise.all([
    db.apiKey.count({
      where: {
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
          lt: new Date(Date.now() + TOKEN_WARN_DAYS * 24 * 60 * 60 * 1000),
        },
      },
    }),
    db.user.count({
      where: {
        status: "WITHDRAWN",
        statusChangedAt: { lt: cutoff },
        username: { not: { startsWith: "deleted_" } },
      },
    }),
  ]);
  return { keysExpiringSoon, anonymizeDue, githubTokenMissing: !env.GITHUB_TOKEN };
}

export async function runRetention(actor: Actor): Promise<RetentionResult> {
  const [anonymized, auditLogsRemoved, keysExpiringSoon] = await Promise.all([
    memberService.anonymizeWithdrawn(actor, RETAIN_MS),
    pruneAuditLogs(actor),
    db.apiKey.count({
      where: {
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
          lt: new Date(Date.now() + TOKEN_WARN_DAYS * 24 * 60 * 60 * 1000),
        },
      },
    }),
  ]);

  return {
    anonymized,
    auditLogsRemoved,
    keysExpiringSoon,
    /*
     * **토큰 만료 «경고»는 여기서 세기만 합니다** (`DEC-020`).
     * GitHub PAT 은 `.env` 에 있고 만료일을 코드가 알 수 없습니다 — 알 수 있는
     * 것은 **있는가 없는가**뿐이고, 없으면 한도가 시간당 60회입니다.
     */
    githubTokenMissing: !env.GITHUB_TOKEN,
  };
}
