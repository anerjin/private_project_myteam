import { RotateCcw } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
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
import { RetryJobButton } from "@/features/jobs/components/retry-job-button";
import { EmptyState } from "@/components/common/empty-state";
import type { JobStatus } from "@/types";
import { requireRole } from "@/server/auth/guards";
import { rateLimit as githubRateLimit } from "@/lib/github";
import * as jobService from "@/server/services/job.service";

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
  const [{ counts, recent: jobs }, rate] = await Promise.all([
    jobService.board(),
    // 못 읽어도 화면이 깨질 이유가 없다 — 카드만 빠진다
    githubRateLimit().catch(() => null),
  ]);

  return (
    <>
      <PageHeader
        title="수집 작업 모니터"
        description="백그라운드 작업의 진행 상황과 실패를 확인합니다."
        action={<AutoRefresh />}
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
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {j.requestedById ?? "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {j.createdAt.toISOString().slice(5, 16).replace("T", " ")}
                  </TableCell>
                  <TableCell className="text-right">
                    {/*
                      QUEUED 도 다시 집을 수 있습니다 — PC 가 꺼져 있던 사이에
                      만들어진 작업은 아무도 안 돌립니다 (`DEC-053` 의 잃는 것).
                    */}
                    {(j.status === "FAILED" || j.status === "QUEUED") && (
                      <RetryJobButton jobId={j.id} />
                    )}
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
