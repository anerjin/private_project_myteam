import { GitBranch, HardDrive } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SystemSettings } from "@/features/admin/components/system-settings";
import { env } from "@/lib/env";
import { humanBytes } from "@/lib/storage";
import { requireRole } from "@/server/auth/guards";
import * as settingsService from "@/server/services/settings.service";
import * as storageService from "@/server/services/storage.service";

export const metadata: Metadata = { title: "시스템 설정" };

/**
 * SCR-261 시스템 설정 (`FR-ADM-015`).
 *
 * ## **빈 섹션을 두지 않습니다**
 *
 * 전에는 업로드 · GitHub · 수집 · 공지·보안 카드가 목 값으로 채워져 있었고,
 * 그 설정들은 **존재하지 않았습니다**. 그런 화면은 숫자가 보이면
 * **그 기능이 도는 줄** 믿게 만듭니다.
 *
 * 지금은 실제로 **저장되고 읽히는 것만** 둡니다 — 네 값 모두
 * `settings.service` 를 지나며, 업로드 상한은 `file.service` 가,
 * 아카이브 상한과 디스크 임계치는 아카이브 작업과 대시보드가 같은 함수로
 * 읽습니다. 설정 화면이 거짓말을 하지 않는 조건이 그것입니다.
 *
 * ## GitHub 토큰은 **DB 에 두지 않습니다**
 *
 * 비밀값을 `system_settings.value` 에 넣고 웹 폼에서 고치게 하면,
 * 같은 시스템이 다른 곳에서는 토큰 문자열을 **차단**하고 있는 것과
 * 모순됩니다 (`NFR-SEC-008`). `.env` 에 두고 여기서는 **있는지 없는지와
 * 그 결과(한도)**만 말합니다.
 */
export default async function AdminSettingsPage() {
  // 실제 인가는 여기서 한다 — 레이아웃이 아니라 page 다 (DEC-035)
  await requireRole("ADMIN");

  const [settings, storage] = await Promise.all([
    settingsService.getAll(),
    storageService.usage(),
  ]);

  const hasToken = Boolean(env.GITHUB_TOKEN);

  return (
    <>
      <PageHeader
        title="시스템 설정"
        description="여기서 바꾼 값은 즉시 적용됩니다. 저장하지 않은 값은 환경변수의 기본값입니다."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">운영 설정</CardTitle>
          <CardDescription>
            가입 허용과 크기 제한입니다. 모두 감사 로그에 남습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SystemSettings
            settings={settings.map((s) => ({
              key: s.key,
              value: s.value,
              overridden: s.overridden,
              updatedAt: s.updatedAt?.toISOString() ?? null,
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HardDrive className="size-4" />
            스토리지
          </CardTitle>
          <CardDescription>
            지금 쓰고 있는 용량입니다. 아카이브 총량 상한(
            {humanBytes(storage.archive.limitBytes)})은 코드에 있습니다 (
            <code>DEC-022</code>).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>디스크 여유</span>
            <span className="tabular-nums">
              {storage.disk.freeGb}GB{" "}
              <span className="text-muted-foreground text-xs">
                (임계치 {storage.disk.minFreeGb}GB)
              </span>
            </span>
          </div>
          <div className="flex justify-between">
            <span>GitHub 아카이브 ({storage.archive.count}건)</span>
            <span className="tabular-nums">
              {humanBytes(storage.archive.bytes)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>첨부 파일 ({storage.attachments.count}개)</span>
            <span className="tabular-nums">
              {humanBytes(storage.attachments.bytes)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitBranch className="size-4" />
            GitHub
          </CardTitle>
          <CardDescription>
            토큰은 <code>.env</code> 의 <code>GITHUB_TOKEN</code> 에 둡니다.
            비밀값을 DB 에 넣고 웹에서 고치게 하지 않습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          {hasToken ? (
            <p>
              토큰이 설정돼 있습니다 — API 한도 <b>시간당 5,000회</b>,
              최신 릴리스 정보도 함께 수집합니다.
            </p>
          ) : (
            <p className="text-muted-foreground">
              토큰이 없습니다 — API 한도 <b>시간당 60회</b>. 메타 수집은 되지만
              최신 릴리스는 건너뜁니다. 저장소를 여러 건 등록하면 한도에
              닿습니다.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}