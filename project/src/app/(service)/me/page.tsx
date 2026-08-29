import type { Metadata } from "next";

import {
  RoleBadge,
  UserStatusBadge,
} from "@/features/members/components/badges";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { ApiKeyPanel } from "@/features/members/components/api-key-panel";
import {
  ProfileForm,
  WithdrawButton,
} from "@/features/members/components/profile-form";
import { SessionList } from "@/features/members/components/session-list";
import { ResourceCard } from "@/features/resources/components/resource-card";
import { env } from "@/lib/env";
import { requireActiveUser } from "@/server/auth/guards";
import { listFor as listSessions } from "@/server/auth/session";
import * as apiKeyService from "@/server/services/api-key.service";
import { getProfile } from "@/server/services/user.service";
import * as notify from "@/server/services/notification.service";
import * as resourceService from "@/server/services/resource.service";

export const metadata: Metadata = { title: "마이페이지" };

/** SCR-141 마이페이지 */
export default async function MePage() {
  const session = await requireActiveUser();
  // 세션 DTO 는 인가용 최소값이다. 가입일·자기소개는 프로필에서 읽는다.
  const me = await getProfile(session.userId);

  const [keys, sessions, notificationRows, mine] = await Promise.all([
    apiKeyService.listFor(session.userId),
    listSessions(session.userId),
    notify.listFor(session.userId, 20),
    /*
     * 내가 등록한 자료 — 「내 활동」 탭 (`FR-USER-004`).
     *
     * **번호가 `FR-USER-005` 로 적혀 있었습니다.** 005 는 「알림 설정」이고
     * 그건 아직 없습니다 — 즉 안 만든 것의 번호가 코드에 있어서
     * `check:fr` 이 그것을 「만들었다」로 셀 뻔했습니다 (`DEC-049` 의 함정).
     */
    resourceService.list(
      { author: session.username, sort: "recent" },
      { kind: "cursor", size: 12 },
      session.userId
    ),
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
              <CardDescription>
                아이디는 변경할 수 없습니다. 이름·소속·자기소개를 고칠 수
                있습니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileForm
                profile={{
                  username: me.username,
                  name: me.name,
                  department: me.department,
                  bio: me.bio,
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-4 space-y-4">
          {/* 알림함 (`FR-NOTI-003`) 은 아래 「알림」 탭입니다 */}
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
            내가 등록한 자료 {mine.items.length}건
            {mine.nextCursor && " (최근 12건)"}
          </h2>
          {mine.items.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border py-8 text-center text-sm">
              아직 등록한 자료가 없습니다.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {mine.items.map((r) => (
                <ResourceCard key={r.id} resource={r} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="notifications" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">알림 수신 설정</CardTitle>
              <CardDescription>
                메일이나 메신저로는 보내지 않습니다. 알림함과 배지로만 알립니다.
                수신 설정 변경은 준비 중입니다.
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
                  {/* 저장 경로가 없다 — 켜고 끌 수 있으면 저장됐다고 믿게 된다 */}
                  <Switch defaultChecked={n.on} aria-label={n.label} disabled />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">최근 알림</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {notificationRows.length === 0 ? (
                <p className="text-muted-foreground py-3 text-sm">
                  아직 알림이 없습니다.
                </p>
              ) : (
                notificationRows.map((n) => (
                  <div key={n.id} className="flex items-start gap-3 py-3">
                    {!n.readAt && (
                      <span className="bg-primary mt-1.5 size-2 shrink-0 rounded-full" />
                    )}
                    <div
                      className={n.readAt ? "text-muted-foreground" : undefined}
                    >
                      <p className="text-sm font-medium">{n.title}</p>
                      {n.body && <p className="text-xs">{n.body}</p>}
                      <p className="text-muted-foreground text-xs">
                        {n.createdAt
                          .toISOString()
                          .slice(0, 16)
                          .replace("T", " ")}
                      </p>
                    </div>
                  </div>
                ))
              )}
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
              <WithdrawButton name={me.name} />
              {/*
                마지막 관리자 판정은 **서버가** 합니다 (`FR-ADM-009`) — 화면이
                미리 세면 그 사이 다른 관리자가 생기거나 사라질 수 있습니다.
              */}
              <p className="text-muted-foreground mt-2 text-xs">
                관리자가 한 명뿐이면 탈퇴할 수 없습니다.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
