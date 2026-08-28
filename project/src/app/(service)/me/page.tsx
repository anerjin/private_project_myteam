import type { Metadata } from "next";

import {
  RoleBadge,
  UserStatusBadge,
} from "@/features/members/components/badges";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { ApiKeyPanel } from "@/features/members/components/api-key-panel";
import { SessionList } from "@/features/members/components/session-list";
import { ResourceCard } from "@/features/resources/components/resource-card";
import { env } from "@/lib/env";
import { requireActiveUser } from "@/server/auth/guards";
import { listFor as listSessions } from "@/server/auth/session";
import * as apiKeyService from "@/server/services/api-key.service";
import { getProfile } from "@/server/services/user.service";
import { notifications, resources } from "@/mocks";

export const metadata: Metadata = { title: "마이페이지" };

/** SCR-141 마이페이지 */
export default async function MePage() {
  const session = await requireActiveUser();
  // 세션 DTO 는 인가용 최소값이다. 가입일·자기소개는 프로필에서 읽는다.
  const me = await getProfile(session.userId);
  // 목 자료의 author.id 는 실제 계정 id 와 맞지 않는다 — P4 에서 실데이터가 오면 맞는다
  const mine = resources.filter((r) => r.author.id === me.id);

  const [keys, sessions] = await Promise.all([
    apiKeyService.listFor(session.userId),
    listSessions(session.userId),
  ]);

  return (
    <>
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">프로필</TabsTrigger>
          <TabsTrigger value="security">보안</TabsTrigger>
          <TabsTrigger value="activity">내 활동</TabsTrigger>
          <TabsTrigger value="notifications">알림</TabsTrigger>
          <TabsTrigger value="account">계정</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">프로필</CardTitle>
              <CardDescription>아이디는 변경할 수 없습니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="username">아이디</FieldLabel>
                  <Input id="username" defaultValue={me.username} disabled />
                </Field>
                <Field>
                  <FieldLabel htmlFor="name">이름</FieldLabel>
                  <Input id="name" defaultValue={me.name} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="dept">소속 팀</FieldLabel>
                  <Input id="dept" defaultValue={me.department ?? ""} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="bio">자기소개</FieldLabel>
                  <Textarea id="bio" rows={3} />
                </Field>
                <Field>
                  <Button className="w-fit">저장</Button>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-4 space-y-4">
          <ApiKeyPanel
            keys={keys.map((k) => ({
              id: k.id,
              name: k.name,
              keyPrefix: k.keyPrefix,
              scopes: k.scopes,
              lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
              expiresAt: k.expiresAt.toISOString(),
              revokedAt: k.revokedAt?.toISOString() ?? null,
              createdAt: k.createdAt.toISOString(),
            }))}
            // 선택 가능 스코프도 서버가 계산해서 준다 (DEC-037)
            allowedScopes={[...apiKeyService.scopesAllowedFor(me.role)]}
            appUrl={env.APP_URL}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">비밀번호 변경</CardTitle>
              <CardDescription>
                변경하면 이 기기를 제외한 다른 세션이 모두 종료됩니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm variant="settings" />
            </CardContent>
          </Card>

          <SessionList
            sessions={sessions.map((s) => ({
              id: s.id,
              ip: s.ip,
              userAgent: s.userAgent,
              lastSeenAt: s.lastSeenAt?.toISOString() ?? null,
              createdAt: s.createdAt.toISOString(),
              current: s.id === session.sessionId,
            }))}
          />
        </TabsContent>

        <TabsContent value="activity" className="mt-4 space-y-4">
          <h2 className="text-sm font-medium">
            내가 등록한 자료 {mine.length}건
          </h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {mine.map((r) => (
              <ResourceCard key={r.id} resource={r} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="notifications" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">알림 수신 설정</CardTitle>
              <CardDescription>
                메일이나 메신저로는 보내지 않습니다. 알림함과 배지로만 알립니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              {[
                {
                  label: "가입 신청 알림",
                  hint: "관리자에게만 해당",
                  on: true,
                },
                {
                  label: "승인·거부 결과",
                  hint: "내 계정 상태가 바뀔 때",
                  on: true,
                },
                {
                  label: "작업 완료·실패",
                  hint: "아카이브·메타 수집 결과",
                  on: true,
                },
              ].map((n) => (
                <div
                  key={n.label}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm">{n.label}</p>
                    <p className="text-muted-foreground text-xs">{n.hint}</p>
                  </div>
                  <Switch defaultChecked={n.on} aria-label={n.label} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">최근 알림</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {notifications.map((n) => (
                <div key={n.id} className="flex items-start gap-3 py-3">
                  {!n.read && (
                    <span className="bg-primary mt-1.5 size-2 shrink-0 rounded-full" />
                  )}
                  <div className={n.read ? "text-muted-foreground" : undefined}>
                    <p className="text-sm font-medium">{n.title}</p>
                    {n.body && <p className="text-xs">{n.body}</p>}
                    <p className="text-muted-foreground text-xs">
                      {n.createdAt.slice(0, 16).replace("T", " ")}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="account" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">계정 정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">역할</span>
                <RoleBadge role={me.role} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">상태</span>
                <UserStatusBadge status={me.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">가입일</span>
                <span>{me.createdAt.toISOString().slice(0, 10)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-destructive text-base">
                회원 탈퇴
              </CardTitle>
              <CardDescription>
                등록한 자료는 남고 작성자 표기만 «탈퇴한 사용자»로 바뀝니다.
                아이디는 재사용할 수 없습니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="text-destructive" disabled>
                탈퇴하기 (마지막 관리자는 탈퇴할 수 없습니다)
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
