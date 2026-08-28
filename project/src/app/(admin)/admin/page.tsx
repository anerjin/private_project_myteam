import {
  AlertTriangle,
  Archive,
  ClipboardCheck,
  HardDrive,
  Library,
  UserPlus,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendChart } from "@/features/dashboard/components/trend-chart";
import { auditLogs, jobs, stats } from "@/mocks";

export const metadata: Metadata = { title: "관리자" };

/** SCR-201 관리자 대시보드 */
export default function AdminDashboardPage() {
  const archivePct = Math.round((stats.archiveUsedGb / stats.archiveLimitGb) * 100);

  return (
    <>
      <PageHeader
        title="관리자 대시보드"
        description="승인 대기 · 검수 대기 · 실패 작업 · 디스크를 한 화면에서 봅니다."
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <Alert>
          <UserPlus />
          <AlertTitle>승인 대기 {stats.pendingMembers}건</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            영업일 1일 안에 처리하는 것을 목표로 합니다.
            <Button size="sm" variant="outline" asChild>
              <Link href="/admin/members">처리하기</Link>
            </Button>
          </AlertDescription>
        </Alert>

        <Alert>
          <ClipboardCheck />
          <AlertTitle>검수 대기 {stats.needsReview}건</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            CLI가 등록한 자료입니다. 요약과 분류를 확인해 주세요.
            <Button size="sm" variant="outline" asChild>
              <Link href="/admin/resources">확인하기</Link>
            </Button>
          </AlertDescription>
        </Alert>

        {stats.failedJobs > 0 && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>실패한 작업 {stats.failedJobs}건</AlertTitle>
            <AlertDescription className="flex items-center gap-3">
              아카이브·링크 확인 작업이 실패했습니다.
              <Button size="sm" variant="outline" asChild>
                <Link href="/admin/jobs">작업 모니터</Link>
              </Button>
            </AlertDescription>
          </Alert>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="전체 회원" value={stats.totalMembers} unit="명" icon={Users} />
        <StatCard
          label="승인 대기"
          value={stats.pendingMembers}
          unit="명"
          icon={UserPlus}
        />
        <StatCard label="전체 자료" value={stats.totalResources} unit="건" icon={Library} />
        <StatCard
          label="디스크 여유"
          value={stats.diskFreeGb}
          unit="GB"
          hint="임계치 20GB"
          icon={HardDrive}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">자료 등록 추이</CardTitle>
            <CardDescription>웹 등록과 CLI 수집을 나눠 봅니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Archive className="size-4" />
              아카이브 사용량
            </CardTitle>
            <CardDescription>총량 상한 {stats.archiveLimitGb}GB</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={archivePct} />
            <div className="flex justify-between text-sm">
              <span className="tabular-nums">{stats.archiveUsedGb} GB 사용</span>
              <span className="text-muted-foreground tabular-nums">{archivePct}%</span>
            </div>
            <p className="text-muted-foreground text-xs">
              80GB에서 경고, 100GB에서 신규 아카이브를 차단합니다.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">최근 활동</CardTitle>
            <CardDescription>감사 로그 최신 5건</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {auditLogs.slice(0, 5).map((l) => (
              <div key={l.id} className="flex items-start gap-3 text-sm">
                <span className="text-muted-foreground w-24 shrink-0 text-xs">
                  {l.createdAt.slice(5, 16).replace("T", " ")}
                </span>
                <span className="flex-1">{l.summary}</span>
                <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
                  {l.via}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">작업 현황</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-2 text-center">
              {(
                [
                  ["대기", "QUEUED"],
                  ["실행", "RUNNING"],
                  ["완료", "DONE"],
                  ["실패", "FAILED"],
                ] as const
              ).map(([label, status]) => (
                <div key={status} className="bg-muted/50 rounded-lg p-3">
                  <p className="text-2xl font-semibold tabular-nums">
                    {jobs.filter((j) => j.status === status).length}
                  </p>
                  <p className="text-muted-foreground text-xs">{label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
