import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { stats } from "@/mocks";

export const metadata: Metadata = { title: "시스템 설정" };

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="space-y-0.5">
        <Label>{label}</Label>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** SCR-261 시스템 설정 */
export default function AdminSettingsPage() {
  const archivePct = Math.round((stats.archiveUsedGb / stats.archiveLimitGb) * 100);

  return (
    <>
      <PageHeader
        title="시스템 설정"
        description="변경 시 확인 후 적용되며 감사 로그에 남습니다."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">가입</CardTitle>
            <CardDescription>
              아이디 기반 가입입니다. 이메일 도메인 제한은 사용하지 않습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            <SettingRow label="신규 가입 허용" hint="끄면 가입 화면이 닫힙니다">
              <Switch defaultChecked />
            </SettingRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">업로드</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <SettingRow label="파일 최대 크기">
              <div className="flex items-center gap-2">
                <Input defaultValue="50" className="w-20 text-right" />
                <span className="text-muted-foreground text-sm">MB</span>
              </div>
            </SettingRow>
            <SettingRow label="아카이브 단일 최대 크기">
              <div className="flex items-center gap-2">
                <Input defaultValue="500" className="w-20 text-right" />
                <span className="text-muted-foreground text-sm">MB</span>
              </div>
            </SettingRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">디스크 · 아카이브</CardTitle>
            <CardDescription>
              파일을 개발 PC 디스크에 보관하므로 상한 관리가 중요합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>아카이브 사용량</span>
                <span className="tabular-nums">
                  {stats.archiveUsedGb} / {stats.archiveLimitGb} GB
                </span>
              </div>
              <Progress value={archivePct} />
            </div>
            <div className="divide-y">
              <SettingRow label="아카이브 총량 상한">
                <div className="flex items-center gap-2">
                  <Input defaultValue="100" className="w-20 text-right" />
                  <span className="text-muted-foreground text-sm">GB</span>
                </div>
              </SettingRow>
              <SettingRow label="경고 임계치">
                <div className="flex items-center gap-2">
                  <Input defaultValue="80" className="w-20 text-right" />
                  <span className="text-muted-foreground text-sm">%</span>
                </div>
              </SettingRow>
              <SettingRow label="최소 디스크 여유" hint={`현재 ${stats.diskFreeGb}GB`}>
                <div className="flex items-center gap-2">
                  <Input defaultValue="20" className="w-20 text-right" />
                  <span className="text-muted-foreground text-sm">GB</span>
                </div>
              </SettingRow>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">GitHub</CardTitle>
            <CardDescription>
              조직 fine-grained PAT · public 저장소 읽기 전용
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            <SettingRow label="토큰">
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="size-3" />
                설정됨
              </Badge>
            </SettingRow>
            <SettingRow label="만료일" hint="만료 30일 전부터 경고합니다">
              <span className="text-sm tabular-nums">2027-08-27</span>
            </SettingRow>
            <SettingRow label="메타 갱신 주기">
              <span className="text-sm">매주 월요일 04:00</span>
            </SettingRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">수집 (CLI · MCP)</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <SettingRow label="Ingest API 사용">
              <Switch defaultChecked />
            </SettingRow>
            <SettingRow label="키당 쓰기 제한">
              <div className="flex items-center gap-2">
                <Input defaultValue="60" className="w-20 text-right" />
                <span className="text-muted-foreground text-sm">회/시간</span>
              </div>
            </SettingRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">공지 · 보관</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="banner">전체 공지 배너</Label>
              <Textarea id="banner" rows={2} placeholder="비워두면 표시하지 않습니다" />
            </div>
            <div className="divide-y">
              <SettingRow label="휴지통 보관">
                <div className="flex items-center gap-2">
                  <Input defaultValue="30" className="w-20 text-right" />
                  <span className="text-muted-foreground text-sm">일</span>
                </div>
              </SettingRow>
              <SettingRow label="감사 로그 보존">
                <div className="flex items-center gap-2">
                  <Input defaultValue="365" className="w-20 text-right" />
                  <span className="text-muted-foreground text-sm">일</span>
                </div>
              </SettingRow>
              <SettingRow label="탈퇴 계정 익명화">
                <div className="flex items-center gap-2">
                  <Input defaultValue="365" className="w-20 text-right" />
                  <span className="text-muted-foreground text-sm">일 후</span>
                </div>
              </SettingRow>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button>설정 저장</Button>
      </div>
    </>
  );
}
