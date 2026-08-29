import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AUDIT_ACTION_LABEL } from "@/features/audit/actions";
import {
  RoleBadge,
  UserStatusBadge,
} from "@/features/members/components/badges";
import { MemberActions } from "@/features/members/components/member-actions";
import { requireRole } from "@/server/auth/guards";
import { listFor as listSessionsFor } from "@/server/auth/session";
import * as memberRepo from "@/server/repositories/member.repository";
import * as apiKeyService from "@/server/services/api-key.service";
import * as audit from "@/server/services/audit.service";
import * as memberService from "@/server/services/member.service";

/*
 * **`generateStaticParams` 를 두지 않습니다.**
 *
 * 전에는 목 회원 id 목록을 빌드에 구워 넣고 있었는데, 같은 페이지가
 * `requireRole("ADMIN")`(→ `cookies()`)으로 어차피 동적이라 서로 모순이었습니다.
 * 그리고 실 DB 의 cuid 는 목 id 와 절대 일치하지 않아 **목록의 모든 링크가 404** 였습니다.
 */

export async function generateMetadata({
  params,
}: PageProps<"/admin/members/[id]">): Promise<Metadata> {
  const { id } = await params;
  const m = await memberRepo.findDetail(id);
  return { title: m ? `${m.name} · 회원 상세` : "회원 상세" };
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function when(value: Date | null, withTime = false): string {
  if (!value) return "없음";
  const iso = value.toISOString();
  return withTime ? iso.slice(0, 16).replace("T", " ") : iso.slice(0, 10);
}

/** UA 전체는 못 읽는다. 알아볼 만큼만 (`session-list` 와 같은 판단) */
function device(ua: string | null): string {
  if (!ua) return "알 수 없음";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X|Macintosh/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Safari\//.test(ua)
        ? "Safari"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : "";
  const label = [os, browser].filter(Boolean).join(" · ");
  return label || ua.slice(0, 40);
}

const HISTORY_SIZE = 20;

/**
 * 「지금 쓸 수 있는 키인가」 — **판정이 한 곳**입니다.
 *
 * `api-key-panel` 이 발급 상한을 셀 때 쓰는 정의와 같아야 합니다
 * (`revokedAt === null && expiresAt > now`). 화면마다 다시 적으면 상세가
 * 「3개」라고 하는데 마이페이지는 「2개」라고 하는 날이 옵니다.
 */
function keyState(k: { revokedAt: Date | null; expiresAt: Date }): {
  usable: boolean;
  label: "폐기됨" | "만료됨" | null;
} {
  if (k.revokedAt) return { usable: false, label: "폐기됨" };
  if (k.expiresAt.getTime() <= Date.now()) {
    return { usable: false, label: "만료됨" };
  }
  return { usable: true, label: null };
}

/**
 * SCR-212 회원 상세 (`FR-ADM-003`) — 프로필 · 활동 내역 · 로그인 이력 · 상태 변경 이력.
 *
 * ## 여기 있던 버튼 다섯 개는 **`onClick` 이 없었습니다**
 *
 * `P3` 가 그것을 지웠고(「있는데 안 된다」보다 없는 편이 정직하다), 이제
 * **배선과 함께** 돌아옵니다 (`MemberActions`).
 *
 * ## 「상태 변경 이력」은 감사 로그를 **그 회원 각도로** 본 것입니다
 *
 * 이력 테이블을 따로 만들지 않습니다. 만들면 같은 사실이 두 곳에 쌓이고,
 * 둘이 어긋나는 날 어느 쪽이 진실인지 알 방법이 없습니다 (`FR-AUDIT-001`
 * 이 이미 「예외 없이 기록」이라고 정했습니다).
 */
export default async function AdminMemberDetailPage({
  params,
}: PageProps<"/admin/members/[id]">) {
  // 실제 인가는 여기서 한다 — 레이아웃이 아니라 page 다 (DEC-035)
  await requireRole("ADMIN");

  const { id } = await params;
  const member = await memberRepo.findDetail(id);
  if (!member) notFound();

  const [activity, sessions, keys, history] = await Promise.all([
    memberService.activityFor(id),
    listSessionsFor(id),
    apiKeyService.listFor(id),
    audit.list({ page: 1, size: HISTORY_SIZE, filter: { targetId: id } }),
  ]);

  const usableKeys = keys.filter((k) => keyState(k).usable);

  return (
    <>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/admin/members">회원 관리</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{member.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title={member.name}
        description={`@${member.username}${member.department ? ` · ${member.department}` : ""}`}
        action={
          <MemberActions
            member={{
              id: member.id,
              name: member.name,
              username: member.username,
              role: member.role,
              status: member.status,
              activeKeys: usableKeys.length,
            }}
          />
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">계정</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <Row
              label="아이디"
              value={<code className="text-xs">@{member.username}</code>}
            />
            <Row label="역할" value={<RoleBadge role={member.role} />} />
            <Row
              label="상태"
              value={<UserStatusBadge status={member.status} />}
            />
            <Row label="가입일" value={when(member.createdAt)} />
            <Row label="최근 로그인" value={when(member.lastLoginAt, true)} />
            <Row label="상태 변경" value={when(member.statusChangedAt, true)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">활동 내역</CardTitle>
            <CardDescription>
              삭제한 자료와 폐기한 키는 세지 않습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            <Row
              label="등록한 자료"
              value={
                activity.resources === 0 ? (
                  "0건"
                ) : (
                  <Link
                    className="underline underline-offset-4"
                    href={`/resources?author=${member.username}`}
                  >
                    {activity.resources}건
                  </Link>
                )
              }
            />
            <Row label="컬렉션" value={`${activity.collections}개`} />
            <Row label="북마크" value={`${activity.bookmarks}건`} />
            <Row label="쓸 수 있는 API 키" value={`${activity.apiKeys}개`} />
          </CardContent>
        </Card>

        {member.signupReason && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">가입 사유</CardTitle>
              <CardDescription>신청자가 직접 적은 내용입니다</CardDescription>
            </CardHeader>
            <CardContent className="text-sm whitespace-pre-wrap">
              {member.signupReason}
            </CardContent>
          </Card>
        )}

        {member.statusReason && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">상태 변경 사유</CardTitle>
              <CardDescription>
                지금 상태가 왜 이런지입니다. 지난 이력은 아래에 있습니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm whitespace-pre-wrap">
              {member.statusReason}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              로그인 이력 ({sessions.length})
            </CardTitle>
            <CardDescription>
              지금 살아 있는 세션입니다. 정지하면 즉시 전부 끊깁니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                로그인된 기기가 없습니다.
              </p>
            ) : (
              <ul className="divide-y text-sm">
                {sessions.map((s) => (
                  <li key={s.id} className="flex justify-between gap-3 py-2">
                    <span>{device(s.userAgent)}</span>
                    <span className="text-muted-foreground text-xs">
                      {s.ip ?? "IP 미기록"} · {when(s.lastSeenAt ?? s.createdAt, true)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">API 키 ({keys.length})</CardTitle>
            <CardDescription>
              폐기는 위 「더 보기」에서 한 번에 합니다 (`FR-ADM-016`).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {keys.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                발급한 키가 없습니다.
              </p>
            ) : (
              <ul className="divide-y text-sm">
                {keys.map((k) => {
                  const state = keyState(k);
                  return (
                    <li
                      key={k.id}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <span className={state.usable ? "" : "text-muted-foreground"}>
                        {k.name}{" "}
                        <code className="text-xs">{k.keyPrefix}…</code>
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {state.label ?? `${when(k.lastUsedAt, true)} 사용`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">상태 변경 이력</CardTitle>
          <CardDescription>
            이 회원에게 일어난 일입니다. 전체는{" "}
            <Link
              className="underline underline-offset-4"
              href="/admin/audit-logs"
            >
              감사 로그
            </Link>
            에 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.items.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              아직 기록이 없습니다.
            </p>
          ) : (
            <ul className="divide-y text-sm">
              {history.items.map((l) => (
                <li key={l.id} className="flex flex-wrap gap-3 py-2">
                  <span className="text-muted-foreground w-36 text-xs tabular-nums">
                    {l.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </span>
                  <Badge variant="secondary">
                    {AUDIT_ACTION_LABEL[
                      l.action as keyof typeof AUDIT_ACTION_LABEL
                    ] ?? l.action}
                  </Badge>
                  <span className="min-w-0 flex-1">{l.summary}</span>
                  <span className="text-muted-foreground font-mono text-xs">
                    @{l.actorUsername}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}