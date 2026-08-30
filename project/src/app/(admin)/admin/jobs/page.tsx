import { RotateCcw } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { MaintenancePanel } from "@/features/admin/components/maintenance-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AutoRefresh } from "@/features/jobs/components/auto-refresh";
import { DeleteJobButton } from "@/features/jobs/components/delete-job-button";
import { PurgeJobsButton } from "@/features/jobs/components/purge-jobs-button";
import { RetryJobButton } from "@/features/jobs/components/retry-job-button";
import { EmptyState } from "@/components/common/empty-state";
import type { JobStatus } from "@/types";
import { requireRole } from "@/server/auth/guards";
import { rateLimit as githubRateLimit } from "@/lib/github";
import * as jobService from "@/server/services/job.service";
import * as maintenanceService from "@/server/services/maintenance.service";

export const metadata: Metadata = { title: "작업 모니터" };

const STATUS_LABEL: Record<JobStatus, string> = {
  QUEUED: "대기",
  RUNNING: "실행 중",
  DONE: "완료",
  FAILED: "실패",
};

const JOB_LABEL: Record<string, string> = {
  FETCH_URL_META: "URL 메타 수집",
  FETCH_GITHUB_META: "GitHub 메타 수집",
  ARCHIVE_GITHUB: "소스 아카이브",
  REFRESH_GITHUB_META: "메타 주기 갱신",
  CHECK_LINK: "링크 생존 확인",
  CLEANUP_TRASH: "휴지통 정리",
};

/**
 * 스케줄 표시 이름 — **주기는 `maintenance.service` 가 압니다.**
 *
 * 여기에는 사람이 읽을 문구만 둡니다. 숫자를 다시 적으면 주기를 고칠 때
 * 화면만 옛 값을 말하게 됩니다.
 */
const SCHEDULE_LABEL: Record<string, string> = {
  REFRESH_GITHUB_META: "저장소 메타 갱신",
  CHECK_LINK: "원본 링크 확인",
  CLEANUP_TRASH: "휴지통 정리",
};

const SCHEDULE_EVERY: Record<string, string> = {
  REFRESH_GITHUB_META: "주 1회",
  CHECK_LINK: "월 1회",
  CLEANUP_TRASH: "일 1회 · 30일 경과분",
};

/** SCR-241 수집 작업 모니터 */
export default async function AdminJobsPage() {
  // 실제 인가는 여기서 한다 — 레이아웃이 아니라 page 다 (DEC-035)
  await requireRole("ADMIN");

  /*
   * **「P6 에서 붙습니다」 안내문을 만들지 않습니다.**
   * 진짜 질의를 붙이면 워커가 없는 지금은 **빈 상태가 저절로** 나오고,
   * `P6` 는 화면을 건드리지 않고 워커만 붙이면 됩니다.
   * 하드코딩한 안내문은 「작업이 있는가」에 대한 두 번째 출처이고,
   * 워커가 붙은 날 그 문장이 남아 있게 됩니다.
   */
  const [
    { counts, recent: jobs, requesterNames },
    rate,
    schedules,
    retention,
    deletable,
  ] = await Promise.all([
    jobService.board(),
    // 못 읽어도 화면이 깨질 이유가 없다 — 카드만 빠진다
    githubRateLimit().catch(() => null),
    // **읽기만** 하는 것들입니다 — 렌더가 데이터를 바꾸면 안 됩니다
    maintenanceService.schedules(),
    maintenanceService.retentionStatus(),
    /*
     * 표는 최근 것만 보여 주지만(`RECENT_LIMIT`) 정리는 **전부**를 지웁니다.
     * 그래서 건수는 화면에 보이는 행이 아니라 **DB 에서** 셉니다 — 안 그러면
     * 버튼이 「20건」이라 하고 200건을 지웁니다.
     */
    jobService.countDeletable(),
  ]);

  return (
    <>
      <PageHeader
        title="수집 작업 모니터"
        description="백그라운드 작업의 진행 상황과 실패를 확인합니다."
        action={
          <div className="flex items-center gap-2">
            <PurgeJobsButton count={deletable} />
            <AutoRefresh />
          </div>
        }
      />

      <MaintenancePanel
        schedules={schedules.map((s) => ({
          type: s.type,
          label: SCHEDULE_LABEL[s.type],
          every: SCHEDULE_EVERY[s.type],
          lastRunAt: s.lastRunAt?.toISOString() ?? null,
          due: s.due,
        }))}
        retention={{
          keysExpiringSoon: retention.keysExpiringSoon,
          githubTokenMissing: retention.githubTokenMissing,
        }}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {counts.map(({ status, n }) => (
          <Card key={status}>
            <CardContent className="p-4">
              <p className="text-muted-foreground text-sm">
                {STATUS_LABEL[status]}
              </p>
              <p className="text-2xl font-semibold tabular-nums">{n}</p>
            </CardContent>
          </Card>
        ))}
        {/*
          GitHub API 잔여량 — `P6` 이 됐으므로 이제 «진짜 숫자»를 보여줍니다.
          전에는 하드코딩한 「4,860」이 있었고, 그럴듯한 숫자가 더 나빴습니다.
          못 읽으면 카드를 안 그립니다 — 「0」이라고 쓰면 그것도 거짓말입니다.
        */}
        {rate && (
          <Card>
            <CardContent className="p-4">
              <p className="text-muted-foreground text-sm">GitHub 잔여 호출</p>
              <p className="text-2xl font-semibold tabular-nums">
                {rate.remaining.toLocaleString()}
                <span className="text-muted-foreground text-sm">
                  {" / "}
                  {rate.limit.toLocaleString()}
                </span>
              </p>
              <p className="text-muted-foreground text-xs">
                {rate.limit <= 60
                  ? "토큰 없음 — GITHUB_TOKEN 을 넣으면 5,000회"
                  : `${rate.resetAt.toISOString().slice(11, 16)} 에 초기화`}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          icon={RotateCcw}
          title="작업이 없습니다"
          description="아카이브·메타 수집 같은 백그라운드 작업이 실행되면 여기에 나옵니다."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>유형</TableHead>
                <TableHead>대상</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">시도</TableHead>
                <TableHead className="text-right">소요</TableHead>
                <TableHead>요청자</TableHead>
                <TableHead>등록 시각</TableHead>
                <TableHead className="text-right">처리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((j) => (
                <TableRow key={j.id}>
                  <TableCell className="text-sm">
                    {JOB_LABEL[j.type as keyof typeof JOB_LABEL] ?? j.type}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="truncate text-sm">
                        {j.resource?.title ?? "-"}
                      </p>
                      {j.errorMessage && (
                        <p className="text-destructive text-xs">
                          {j.errorMessage}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        j.status === "FAILED"
                          ? "destructive"
                          : j.status === "DONE"
                            ? "secondary"
                            : "default"
                      }
                    >
                      {STATUS_LABEL[j.status as JobStatus]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {j.attempts}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
                    {j.startedAt && j.finishedAt
                      ? `${((j.finishedAt.getTime() - j.startedAt.getTime()) / 1000).toFixed(1)}s`
                      : "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {(j.requestedById && requesterNames[j.requestedById]) ?? "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {j.createdAt.toISOString().slice(5, 16).replace("T", " ")}
                  </TableCell>
                  <TableCell className="text-right">
                    {/*
                      **판정을 화면에 다시 적지 않습니다.** `isRetryable` 이
                      서비스와 같은 규칙을 씁니다 — 전에는 여기에
                      `FAILED || QUEUED` 를 손으로 적어 두어, `DEC-053` 이
                      「재실행으로 받는다」고 한 **`RUNNING` 잔류에 버튼이
                      없었습니다.**
                    */}
                    {/*
                      재실행과 삭제는 **겹치지 않습니다** — `FAILED` 는 둘 다
                      되고(다시 돌리거나 치우거나), `QUEUED`·`RUNNING` 은
                      재실행만, `DONE` 은 삭제만 됩니다. 판정은 양쪽 다
                      `job.service` 가 합니다.
                    */}
                    <div className="flex items-center justify-end gap-1">
                      {jobService.isRetryable(j) && (
                        <RetryJobButton
                          jobId={j.id}
                          stale={j.status === "RUNNING"}
                        />
                      )}
                      {jobService.isDeletable(j) && (
                        <DeleteJobButton jobId={j.id} />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
