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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  RoleBadge,
  UserStatusBadge,
} from "@/features/members/components/badges";
import { requireRole } from "@/server/auth/guards";
import * as memberRepo from "@/server/repositories/member.repository";

/*
 * **`generateStaticParams` 를 두지 않습니다.**
 *
 * 전에는 목 회원 id 목록을 빌드에 구워 넣고 있었는데, 같은 페이지가
 * `requireRole("ADMIN")`(→ `cookies()`)으로 어차피 동적이라 서로 모순이었습니다.
 * 그리고 실 DB 의 cuid 는 목 id 와 절대 일치하지 않아 **목록의 모든 링크가 404** 였습니다.
 * P3 가 목록만 실데이터로 바꾸면서 링크 대상을 두고 온 것이라, 「아직 안 함」이 아니라
 * **깨뜨린 것**이었습니다 (`DEV-07 · 7.11` 「깨진 채로 끝내지 않는다」).
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

/**
 * SCR-212 회원 상세 (FR-ADM-003).
 *
 * **처리 버튼은 목록 화면에 있습니다.** 여기 있던 「비밀번호 초기화 / 정지 / 정지 해제 /
 * 강제 탈퇴 / API 키 전체 폐기」는 전부 `onClick` 없는 장식이었습니다 —
 * 관리자가 눌러 보고 아무 일도 안 일어나는 것을 겪습니다.
 * 상세의 처리 배선은 `FR-ADM-003` 전체와 함께 **P8**(관리자 전체)에서 합니다 (`DEC-045`).
 * 「등록한 자료」·「관련 감사 로그」 카드도 같은 이유로 뺐습니다 — 목 데이터였습니다.
 */
export default async function AdminMemberDetailPage({
  params,
}: PageProps<"/admin/members/[id]">) {
  // 실제 인가는 여기서 한다 — 레이아웃이 아니라 page 다 (DEC-035)
  await requireRole("ADMIN");

  const { id } = await params;
  const member = await memberRepo.findDetail(id);
  if (!member) notFound();

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

        <div className="space-y-4">
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
                  지금 상태가 왜 이런지입니다. 지난 이력은 감사 로그에 있습니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">
                {member.statusReason}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
