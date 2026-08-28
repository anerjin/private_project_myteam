import { KeyRound, RotateCcw, ShieldOff, UserMinus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RoleBadge, UserStatusBadge } from "@/features/members/components/badges";
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiKeys, auditLogs, members, resources } from "@/mocks";
import { getContentType } from "@/features/resources/content-types";

export async function generateStaticParams() {
  return members.map((m) => ({ id: m.id }));
}

export async function generateMetadata({
  params,
}: PageProps<"/admin/members/[id]">): Promise<Metadata> {
  const { id } = await params;
  const m = members.find((x) => x.id === id);
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

/** SCR-212 회원 상세 */
export default async function AdminMemberDetailPage({
  params,
}: PageProps<"/admin/members/[id]">) {
  const { id } = await params;
  const member = members.find((m) => m.id === id);
  if (!member) notFound();

  const mine = resources.filter((r) => r.author.id === member.id);
  const logs = auditLogs.filter((l) => l.actorUsername === member.username);
  const keys = member.apiKeyCount > 0 ? apiKeys.slice(0, member.apiKeyCount) : [];
  const byChannel = {
    web: mine.filter((r) => r.sourceChannel === "WEB").length,
    mcp: mine.filter((r) => r.sourceChannel === "MCP").length,
  };

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
        description={`@${member.username} · ${member.department}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm">
              <KeyRound className="size-4" />
              비밀번호 초기화
            </Button>
            {member.status === "SUSPENDED" ? (
              <Button variant="outline" size="sm">
                <RotateCcw className="size-4" />
                정지 해제
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="text-destructive">
                <ShieldOff className="size-4" />
                정지
              </Button>
            )}
            <Button variant="outline" size="sm" className="text-destructive">
              <UserMinus className="size-4" />
              강제 탈퇴
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">계정</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <Row label="아이디" value={<code className="text-xs">@{member.username}</code>} />
            <Row label="역할" value={<RoleBadge role={member.role} />} />
            <Row label="상태" value={<UserStatusBadge status={member.status} />} />
            <Row label="가입일" value={member.createdAt.slice(0, 10)} />
            <Row
              label="최근 로그인"
              value={member.lastLoginAt?.slice(0, 16).replace("T", " ") ?? "없음"}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">활동</CardTitle>
            <CardDescription>등록 경로별로 나눠 봅니다</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            <Row label="등록한 자료" value={`${mine.length}건`} />
            <Row label="웹 등록" value={`${byChannel.web}건`} />
            <Row label="CLI 수집" value={`${byChannel.mcp}건`} />
            <Row label="감사 로그" value={`${logs.length}건`} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">API 키</CardTitle>
              <CardDescription>{keys.length}개 발급</CardDescription>
            </div>
            {keys.length > 0 && (
              <Button variant="outline" size="sm" className="text-destructive">
                전체 폐기
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {keys.length === 0 ? (
              <p className="text-muted-foreground text-sm">발급한 키가 없습니다.</p>
            ) : (
              keys.map((k) => (
                <div key={k.id} className="space-y-1 text-sm">
                  <p className="font-medium">{k.name}</p>
                  <code className="text-muted-foreground text-xs">{k.keyPrefix}…</code>
                  <div className="flex flex-wrap gap-1">
                    {k.scopes.map((s) => (
                      <Badge key={s} variant="secondary" className="text-[10px]">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {member.status === "PENDING" && member.signupReason && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">가입 사유</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{member.signupReason}</CardContent>
        </Card>
      )}

      {member.statusReason && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">상태 변경 사유</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{member.statusReason}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">등록한 자료</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {mine.length === 0 ? (
            <p className="text-muted-foreground p-6 text-sm">등록한 자료가 없습니다.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>제목</TableHead>
                  <TableHead>타입</TableHead>
                  <TableHead>경로</TableHead>
                  <TableHead>등록일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mine.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link
                        href={`/resources/${getContentType(r.type).slug}/${r.slug}`}
                        className="hover:text-primary font-medium"
                      >
                        {r.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {getContentType(r.type).label}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.sourceChannel}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {r.createdAt.slice(0, 10)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">관련 감사 로그</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {logs.length === 0 ? (
            <p className="text-muted-foreground text-sm">기록이 없습니다.</p>
          ) : (
            logs.map((l) => (
              <div key={l.id} className="flex items-start gap-3 text-sm">
                <span className="text-muted-foreground w-28 shrink-0 text-xs tabular-nums">
                  {l.createdAt.slice(5, 16).replace("T", " ")}
                </span>
                <span className="flex-1">{l.summary}</span>
                <Badge variant={l.via === "MCP" ? "default" : "secondary"}>
                  {l.via}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  );
}
