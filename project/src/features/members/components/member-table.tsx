"use client";

import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserStatusBadge } from "@/features/members/components/badges";
import {
  canAttempt,
  isResettableStatus,
  type MemberStatus,
} from "@/features/members/schema";
import {
  reactivateMemberAction,
  resetMemberPasswordAction,
  suspendMemberAction,
} from "@/server/actions/member.actions";
import { ReasonDialog } from "@/features/members/components/reason-dialog";

/**
 * SCR-211 회원 관리 (FR-ADM-002 · 005~007).
 *
 * **판정은 전부 서버가 합니다.** 마지막 활성 계정 보호(`LAST_ACTIVE_ACCOUNT`)·상태 전이 가능 여부
 * (`INVALID_STATE`)를 화면에서 미리 판단하지 않습니다 — 판단해도 동시 처리에서 틀리고,
 * 두 곳에 규칙이 생깁니다 (`DEC-036`).
 *
 * ## 「승인 대기」 탭과 일괄 처리가 **없습니다** (`DEC-077`)
 *
 * 가입 신청이 없어졌으므로 승인·거부·재검토 버튼과 그 탭이 사라졌습니다.
 * 체크박스도 함께 걷었습니다 — 남은 일괄 동작이 하나도 없는데 체크박스를 두면
 * **아무 데도 이어지지 않는 선택**을 화면이 권하게 됩니다. 정지·탈퇴는 사유를
 * 받아야 해서 애초에 묶이지 않습니다.
 *
 * ## 「역할」 칸·필터·변경 메뉴가 **없습니다** (`DEC-077`)
 *
 * 사람이 전부 관리자라 구분할 값이 없습니다. 표의 열, 상단의 역할 필터,
 * 행 메뉴의 「역할을 … 로 변경」이 함께 사라졌습니다.
 */

export interface MemberRow {
  id: string;
  username: string;
  name: string;
  department: string | null;
  status: MemberStatus;
  createdAt: string;
}

/*
 * 메뉴 구성은 `features/members/schema.ts` 의 **`TRANSITION_FROM` 한 벌**을 봅니다.
 * 서버의 `SPECS` 도 같은 표를 읽으므로 **복제가 아니라 공유**입니다 —
 * 자세한 분업(정적 사실은 공유, 동적 판정은 서버)은 그 파일 주석에 있습니다.
 */

/**
 * 세션 무효화 실패를 **숨기지 않고 말합니다** (`DEC-036`).
 * 「조용히 성공한 척」과 「본 작업을 되돌림」 사이의 정답은
 * 「했고, 어디까지 됐는지 말한다」입니다.
 */
function reportSessions(
  label: string,
  sessions: { deleted: number; cacheInvalidated: boolean }
) {
  if (sessions.cacheInvalidated) {
    toast.success(
      sessions.deleted > 0
        ? `${label} · 세션 ${sessions.deleted}개 종료`
        : label
    );
    return;
  }
  toast.warning(`${label} · 세션 ${sessions.deleted}개 종료`, {
    description: "캐시 무효화에 실패했습니다 — 최대 15분간 남을 수 있습니다.",
    duration: 10_000,
  });
}

function MemberRows({
  list,
  onSuspend,
  onAction,
}: {
  list: MemberRow[];
  onSuspend: (m: MemberRow) => void;
  onAction: (fn: () => Promise<void>) => void;
}) {
  async function reactivate(m: MemberRow) {
    const r = await reactivateMemberAction(m.id);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    reportSessions(`${m.name}님의 정지를 해제했습니다`, r.data.sessions);
  }

  async function resetPassword(m: MemberRow) {
    const r = await resetMemberPasswordAction(m.id);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    // 메일을 보내지 않으므로 관리자가 직접 전달한다 (DEC-015)
    toast.success(`${m.name}님의 임시 비밀번호`, {
      description: r.data.temporaryPassword,
      duration: 60_000,
    });
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>이름</TableHead>
            <TableHead>아이디</TableHead>
            <TableHead>소속</TableHead>
            <TableHead>상태</TableHead>
            <TableHead>등록일</TableHead>
            <TableHead className="w-32 text-right">처리</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((m) => (
            <TableRow key={m.id}>
              <TableCell>
                <Link
                  href={`/admin/members/${m.id}`}
                  className="hover:text-primary font-medium"
                >
                  {m.name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground font-mono text-xs">
                @{m.username}
              </TableCell>
              <TableCell className="text-sm">{m.department ?? "-"}</TableCell>
              <TableCell>
                <UserStatusBadge status={m.status} />
              </TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {m.createdAt.slice(0, 10)}
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="더보기">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/admin/members/${m.id}`}>상세 보기</Link>
                    </DropdownMenuItem>

                    {isResettableStatus(m.status) && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => onAction(() => resetPassword(m))}
                        >
                          비밀번호 초기화
                        </DropdownMenuItem>
                      </>
                    )}
                    {canAttempt("REACTIVATE", m.status) && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => onAction(() => reactivate(m))}
                        >
                          정지 해제
                        </DropdownMenuItem>
                      </>
                    )}
                    {canAttempt("SUSPEND", m.status) && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onSelect={() => onSuspend(m)}
                        >
                          정지
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
          {list.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={6}
                className="text-muted-foreground py-8 text-center text-sm"
              >
                해당하는 회원이 없습니다.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function MemberTable({ members }: { members: MemberRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [suspending, setSuspending] = useState<MemberRow | null>(null);
  const [q, setQ] = useState("");

  /**
   * 액션 실행 후 서버 데이터를 다시 읽는다.
   *
   * **실패해도 새로고침합니다.** `INVALID_STATE` 는 대개 「다른 관리자가 이미 처리했다」는
   * 뜻이고, 그때야말로 화면이 낡았다는 신호입니다.
   *
   * 프라미스를 돌려주는 이유는 다이얼로그가 «처리 중»을 붙잡을 수 있게 하기 위해서입니다 —
   * `startTransition` 은 즉시 반환하므로 그냥 부르면 버튼이 곧바로 풀립니다.
   */
  function run(fn: () => Promise<void>): Promise<void> {
    return new Promise((resolve) => {
      startTransition(async () => {
        try {
          await fn();
        } finally {
          router.refresh();
          resolve();
        }
      });
    });
  }

  const filter = (status?: MemberRow["status"]) =>
    members.filter((m) => {
      if (status && m.status !== status) return false;
      if (!q) return true;
      const n = q.toLowerCase();
      // 이름도 소문자로 맞춘다 — 아이디만 대소문자를 무시하면 규칙이 둘이 된다
      return (
        m.name.toLowerCase().includes(n) || m.username.toLowerCase().includes(n)
      );
    });

  const rows = (list: MemberRow[]) => (
    <MemberRows list={list} onSuspend={setSuspending} onAction={run} />
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이름 · 아이디 검색"
          className="w-full sm:w-56"
        />
        {/* 🔄 여기 「역할 필터」 셀렉트가 있었습니다 (`DEC-077` 로 지움) */}
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">전체 ({filter().length})</TabsTrigger>
          <TabsTrigger value="suspended">
            정지 ({filter("SUSPENDED").length})
          </TabsTrigger>
          <TabsTrigger value="withdrawn">
            탈퇴 ({filter("WITHDRAWN").length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          {rows(filter())}
        </TabsContent>
        <TabsContent value="suspended" className="mt-4">
          {rows(filter("SUSPENDED"))}
        </TabsContent>
        <TabsContent value="withdrawn" className="mt-4">
          {rows(filter("WITHDRAWN"))}
        </TabsContent>
      </Tabs>

      <ReasonDialog
        open={suspending !== null}
        onOpenChange={(o) => !o && setSuspending(null)}
        target={
          suspending ? `${suspending.name} (@${suspending.username})` : ""
        }
        title="회원 정지"
        confirmLabel="정지"
        hint="정지 즉시 모든 세션이 끊기고 API 키도 무효가 됩니다. 사유는 감사 로그와 관리자 화면에만 남고 본인에게는 전달되지 않습니다."
        onConfirm={(reason) =>
          run(async () => {
            const m = suspending;
            if (!m) return;
            const r = await suspendMemberAction({ id: m.id, reason });
            setSuspending(null);
            if (!r.ok) {
              toast.error(r.message);
              return;
            }
            reportSessions(`${m.name}님을 정지했습니다`, r.data.sessions);
          })
        }
      />
    </div>
  );
}
