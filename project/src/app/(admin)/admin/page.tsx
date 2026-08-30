import {
  HardDrive,
  Library,
  TriangleAlert,
  UserPlus,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { humanBytes } from "@/lib/storage";
import { requireRole } from "@/server/auth/guards";
import * as audit from "@/server/services/audit.service";
import * as jobService from "@/server/services/job.service";
import * as memberService from "@/server/services/member.service";
import * as resourceService from "@/server/services/resource.service";
import * as storageService from "@/server/services/storage.service";

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
 * 그래서 **지금 있는 것만 보여주고**, 각 페이즈가 자기 카드를 더합니다.
 * 「빈 섹션을 두는 것」과 「섹션을 안 두는 것」은 다릅니다.
 *
 * ## `P8` 이 더한 것 (`FR-ADM-001`, `FR-FILE-006`, `DEC-022`)
 *
 * **실패한 작업 배너** — 「0건」 카드를 두지 않은 이유가 여기서 값을 냅니다.
 * 지금은 실패가 있을 때만 나타나므로, 보이면 그 자체가 할 일입니다.
 *
 * **스토리지 게이지** — 아카이브 상한(100GB)은 `P6` 부터 «차단»으로만
 * 존재했습니다. 관리자는 거부당하고 나서야 얼마나 찼는지 알았습니다.
 * 게이지와 차단이 `storage.service` 의 **같은 숫자**를 봅니다.
 */
export default async function AdminDashboardPage() {
  // 실제 인가는 여기서 한다 — 레이아웃이 아니라 page 다 (DEC-035)
  await requireRole("ADMIN");

  const [pendingMembers, totalMembers, typeCounts, storage, recent, jobs] =
    await Promise.all([
      // 배지와 같은 출처를 본다 (DEC-038) — 두 곳에서 다른 숫자가 나오면 안 된다
      memberService.countPending(),
      memberService.countAll(),
      resourceService.countByType(),
      storageService.usage(),
      audit.list({ page: 1, size: 5 }),
      jobService.board(),
    ]);

  const totalResources = Object.values(typeCounts).reduce((a, b) => a + b, 0);
  const disk = storage.disk;
  const failed = jobs.counts.find((c) => c.status === "FAILED")?.n ?? 0;

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

      {/*
        **실패한 작업은 배너로 말합니다.** 카드로 「0건」을 띄우면 워커가 없어서
        0인지 잘 돌아서 0인지 구별이 안 됩니다 — 보이면 곧 할 일입니다.
      */}
      {failed > 0 && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>실패한 작업 {failed}건</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            메타 수집이나 아카이브가 끝내 실패했습니다. 원인을 보고 다시
            실행할 수 있습니다.
            <Button size="sm" variant="outline" asChild>
              <Link href="/admin/jobs">작업 보기</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* 디스크는 «임계치 미만일 때만» 배너입니다 — 평소엔 아래 카드로 충분합니다 */}
      {!disk.ok && (
        <Alert variant="destructive">
          <HardDrive />
          <AlertTitle>디스크 여유 부족 — {Math.round(disk.freeGb)}GB</AlertTitle>
          <AlertDescription>
            업로드와 아카이브가 거부됩니다. 오래된 아카이브를 정리하거나 디스크를
            확보해 주세요.
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
          <CardTitle className="text-base">스토리지</CardTitle>
          <CardDescription>
            아카이브에는 총량 상한이 있습니다 (`DEC-022`). 첨부에는 개별 크기
            제한만 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-baseline justify-between text-sm">
              <span>GitHub 아카이브 ({storage.archive.count}건)</span>
              <span className="tabular-nums">
                {humanBytes(storage.archive.bytes)} /{" "}
                {humanBytes(storage.archive.limitBytes)}
              </span>
            </div>
            {/*
              **차단과 같은 숫자를 봅니다.** 게이지가 다른 값을 그리면
              「아직 여유 있는데 거부당했다」가 됩니다.
            */}
            {/*
              **게이지에도 이름이 필요합니다** (`NFR-A11Y-005`). 옆의 숫자는
              화면으로 «보는» 사람에게만 이 막대와 이어집니다 — 스크린리더는
              「진행률 표시줄」이라고만 읽습니다. axe 가
              `aria-progressbar-name` (serious) 으로 잡았습니다.
            */}
            <Progress
              aria-label="GitHub 아카이브 사용량"
              value={Math.min(100, storage.archive.ratio * 100)}
            />
            {storage.archive.full ? (
              <p className="text-destructive text-xs">
                상한에 닿았습니다. 새 아카이브가 거부됩니다.
              </p>
            ) : storage.archive.warn ? (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                상한의 80%를 넘었습니다. 오래된 아카이브를 정리하세요.
              </p>
            ) : null}
          </div>

          <div className="flex items-baseline justify-between text-sm">
            <span>첨부 파일 ({storage.attachments.count}개)</span>
            <span className="tabular-nums">
              {humanBytes(storage.attachments.bytes)}
            </span>
          </div>
        </CardContent>
      </Card>

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
