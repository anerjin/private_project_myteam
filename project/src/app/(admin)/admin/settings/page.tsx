import { HardDrive, UserPlus } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { getDiskStatus } from "@/lib/disk";
import { requireRole } from "@/server/auth/guards";
import * as settingsService from "@/server/services/settings.service";

export const metadata: Metadata = { title: "시스템 설정" };

/**
 * SCR-261 시스템 설정 (`FR-ADM-014`·`FR-ADM-015`).
 *
 * ## **빈 섹션을 두지 않습니다**
 *
 * 전에는 「업로드 · GitHub · 수집 · 공지·보관」 카드가 목 값으로 채워져 있었습니다.
 * 그 설정들은 **아직 존재하지 않습니다** — 업로드는 `P6`, GitHub·수집은 `P6`·`P7`
 * 몫이고 `system_settings` 에 그 키가 없습니다.
 * 그럴듯한 숫자가 보이면 **그 기능이 도는 줄 압니다** (관리자 대시보드에서
 * 「아카이브 0GB 사용」을 뺀 것과 같은 판단).
 *
 * 지금 실제로 있는 것만 보여줍니다: **가입 개방 여부**(`auth.service.signUp` 이
 * 읽는 그 값)와 **디스크**(`lib/disk.ts`).
 *
 * 저장은 `P8`(관리자 전체)입니다. 그래서 스위치가 `disabled` 입니다 —
 * 켜고 끌 수 있으면 저장됐다고 믿게 됩니다.
 */
export default async function AdminSettingsPage() {
  // 실제 인가는 여기서 한다 — 레이아웃이 아니라 page 다 (DEC-035)
  await requireRole("ADMIN");

  /*
   * **`auth.service.signUp` 과 «같은 함수»를 부릅니다.** 전에는 이 page 가
   * Prisma 를 직접 불러 같은 행을 읽고 「없으면 열려 있다」를 여기서 다시
   * 판정했습니다 — 열쇠 문자열과 기본값이 두 곳에 있었습니다.
   */
  const [signupEnabled, disk] = await Promise.all([
    settingsService.isSignupEnabled(),
    getDiskStatus(),
  ]);

  return (
    <>
      <PageHeader
        title="시스템 설정"
        description="지금 켜져 있는 값만 보여줍니다. 변경은 준비 중입니다."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="size-4" />
            가입
          </CardTitle>
          <CardDescription>
            닫아 두면 가입 신청 자체를 받지 않습니다 (`FR-ADM-015`).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-sm">신규 가입 받기</p>
            <p className="text-muted-foreground text-xs">
              {signupEnabled
                ? "지금 가입 신청을 받고 있습니다."
                : "지금 가입 신청을 받지 않습니다."}
            </p>
          </div>
          <Switch
            checked={signupEnabled}
            disabled
            aria-label="신규 가입 받기"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HardDrive className="size-4" />
            디스크
          </CardTitle>
          <CardDescription>
            개발 PC 디스크를 씁니다 (`DEC-016`). 여유가 임계치 아래로 내려가면
            아카이브를 멈춥니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">여유 공간</span>
            <span className="tabular-nums">{Math.round(disk.freeGb)} GB</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">상태</span>
            <span className={disk.ok ? undefined : "text-destructive"}>
              {disk.ok ? "정상" : "임계치 미만"}
            </span>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
