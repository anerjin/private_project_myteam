import { HardDrive, Library, UserPlus, Users } from "lucide-react";
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
import { getDiskStatus } from "@/lib/disk";
import { requireRole } from "@/server/auth/guards";
import * as audit from "@/server/services/audit.service";
import * as memberService from "@/server/services/member.service";
import * as resourceService from "@/server/services/resource.service";

export const metadata: Metadata = { title: "관리자" };

/**
 * SCR-201 관리자 대시보드.
 *
 * ## 카드를 **하나의 `stats` 객체로 묶지 않습니다**
 *
 * 전에는 목 `stats` 하나가 회원 수·자료 수·디스크·아카이브 사용량·실패 작업을
 * 함께 들고 있었고, 그 값들이 **네 페이즈에 흩어져** 있습니다
 * (자료 P4 · 디스크 지금 · 아카이브 P5 · 작업 P6).
 * `getStats()` 하나로 만들면 P5·P6 가 그 함수를 고쳐야 하고, 없는 값에 `0` 을 넣게 됩니다.
 *
 * **`0` 은 「없다」가 아니라 「0건」이라고 말합니다.** 「아카이브 0GB 사용」이 뜨면
 * 아카이브가 도는 줄 알고, 「실패한 작업 0건」은 워커가 없어서 0인지 잘 돌아서 0인지
 * 구분이 안 됩니다.
 *
 * 그래서 **지금 있는 것만 보여주고**, `P5`(아카이브)·`P6`(워커)가 각자 자기 카드를
 * 더합니다. 「빈 섹션을 두는 것」과 「섹션을 안 두는 것」은 다릅니다
 * (`/me` 프로필·회원 상세에서 내린 것과 같은 판단).
 */
export default async function AdminDashboardPage() {
  // 실제 인가는 여기서 한다 — 레이아웃이 아니라 page 다 (DEC-035)
  await requireRole("ADMIN");

  const [pendingMembers, totalMembers, typeCounts, disk, recent] =
    await Promise.all([
      // 배지와 같은 출처를 본다 (DEC-038) — 두 곳에서 다른 숫자가 나오면 안 된다
      memberService.countPending(),
      memberService.countAll(),
      resourceService.countByType(),
      getDiskStatus(),
      audit.list({ page: 1, size: 5 }),
    ]);

  const totalResources = Object.values(typeCounts).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        title="관리자 대시보드"
        description="승인 대기 · 자료 · 디스크를 한 화면에서 봅니다."
      />

      {/* 대기 건수가 0이면 알림 자체를 띄우지 않는다 — 「0건 대기」는 할 일이 아니다 */}
      {pendingMembers > 0 && (
        <Alert>
          <UserPlus />
          <AlertTitle>승인 대기 {pendingMembers}건</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            영업일 1일 안에 처리하는 것을 목표로 합니다.
            <Button size="sm" variant="outline" asChild>
              <Link href="/admin/members">처리하기</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="전체 회원"
          value={totalMembers}
          unit="명"
          icon={Users}
        />
        <StatCard
          label="승인 대기"
          value={pendingMembers}
          unit="명"
          icon={UserPlus}
        />
        <StatCard
          label="전체 자료"
          value={totalResources}
          unit="건"
          icon={Library}
        />
        <StatCard
          label="디스크 여유"
          value={Math.round(disk.freeGb)}
          unit="GB"
          hint={disk.ok ? "여유 있음" : "임계치 미만"}
          icon={HardDrive}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">최근 활동</CardTitle>
          <CardDescription>감사 로그 최신 5건</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {recent.items.length === 0 ? (
            <p className="text-muted-foreground text-sm">기록이 없습니다.</p>
          ) : (
            recent.items.map((l) => (
              <div key={l.id} className="flex items-start gap-3 text-sm">
                <span className="text-muted-foreground w-24 shrink-0 text-xs">
                  {l.createdAt.toISOString().slice(5, 16).replace("T", " ")}
                </span>
                <span className="flex-1">{l.summary}</span>
                <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
                  {l.via}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/*
        여기 있던 「자료 등록 추이」·「아카이브 사용량」·「작업 현황」 카드는
        **뺐습니다.** 추이는 파생 질의(P4 남은 범위), 아카이브는 P5, 작업은 P6 라
        지금은 셋 다 데이터가 없습니다. 각 페이즈가 자기 카드를 더합니다.
      */}
    </>
  );
}
