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
import { jobs } from "@/mocks";
import type { JobStatus } from "@/types";

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
export default function AdminJobsPage() {
  const counts = (["QUEUED", "RUNNING", "DONE", "FAILED"] as JobStatus[]).map(
    (s) => ({
      status: s,
      n: jobs.filter((j) => j.status === s).length,
    })
  );

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
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-sm">GitHub API 잔여</p>
            <p className="text-2xl font-semibold tabular-nums">4,860</p>
            <p className="text-muted-foreground text-xs">12:00 리셋</p>
          </CardContent>
        </Card>
      </div>

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
                <TableCell className="text-sm">{JOB_LABEL[j.type]}</TableCell>
                <TableCell>
                  <div>
                    <p className="truncate text-sm">{j.targetTitle}</p>
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
                    {STATUS_LABEL[j.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {j.attempts}
                </TableCell>
                <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
                  {j.durationMs ? `${(j.durationMs / 1000).toFixed(1)}s` : "-"}
                </TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">
                  {j.requestedBy}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {j.createdAt.slice(5, 16).replace("T", " ")}
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
    </>
  );
}
