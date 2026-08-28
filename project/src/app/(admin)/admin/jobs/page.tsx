import { RotateCcw } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { EmptyState } from "@/components/common/empty-state";
import type { JobStatus } from "@/types";
import { requireRole } from "@/server/auth/guards";
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
  const { counts, recent: jobs } = await jobService.board();

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
          GitHub API 잔여량 카드는 **뺐습니다.** 하드코딩한 「4,860」은
          그럴듯해서 더 나쁩니다 — 그 숫자를 아는 것은 GitHub 클라이언트이고
          그건 `P6` 입니다. 없는 카드는 그때 더합니다.
        */}
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
                    {j.status === "FAILED" && (
                      <Button size="sm" variant="outline">
                        <RotateCcw className="size-3.5" />
                        재실행
                      </Button>
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
