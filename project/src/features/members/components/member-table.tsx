"use client";

import { Check, MoreHorizontal, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  RoleBadge,
  UserStatusBadge,
} from "@/features/members/components/badges";
import {
  canAttempt,
  isReasonLongEnough,
  isResettableStatus,
  REASON_MIN_LENGTH,
} from "@/features/members/schema";
import {
  approveMembersAction,
  changeRoleAction,
  reactivateMemberAction,
  rejectMemberAction,
  reopenMemberAction,
  resetMemberPasswordAction,
  suspendMemberAction,
} from "@/server/actions/member.actions";

/**
 * SCR-211 회원 관리 (FR-ADM-002~007).
 *
 * **판정은 전부 서버가 합니다.** 마지막 관리자 보호(`LAST_ADMIN`)·상태 전이 가능 여부
 * (`INVALID_STATE`)를 화면에서 미리 판단하지 않습니다 — 판단해도 동시 처리에서 틀리고,
 * 두 곳에 규칙이 생깁니다 (`DEC-036`).
 */

export interface MemberRow {
  id: string;
  username: string;
  name: string;
  department: string | null;
  role: "MEMBER" | "EDITOR" | "ADMIN";
  status: "PENDING" | "ACTIVE" | "REJECTED" | "SUSPENDED" | "WITHDRAWN";
  signupReason: string | null;
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
  selected,
  toggle,
  onReject,
  onSuspend,
  onAction,
  busy,
}: {
  list: MemberRow[];
  selected: string[];
  toggle: (id: string) => void;
  onReject: (m: MemberRow) => void;
  onSuspend: (m: MemberRow) => void;
  onAction: (fn: () => Promise<void>) => void;
  busy: boolean;
}) {
  const showPending = list.some((m) => m.status === "PENDING");

  async function approve(m: MemberRow) {
    const r = await approveMembersAction({ ids: [m.id] });
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    // 단건이어도 부분 성공 형식으로 돌아온다 (DEC-039)
    const failed = r.data.failed[0];
    if (failed) {
      toast.error(`${m.name}: ${failed.message}`);
      return;
    }
    // 승인도 세션을 끊는다 — 무효화가 실패하면 승인된 사용자가 계속 /pending 으로 튕긴다
    const s = r.data.succeeded[0];
    if (s) reportSessions(`${m.name}님을 승인했습니다`, s.sessions);
  }

  /** 거부를 되돌린다 (`DEC-042`) — 이것이 없으면 오타 한 번이 계정을 영구 폐기한다 */
  async function reopen(m: MemberRow) {
    const r = await reopenMemberAction(m.id);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success(`${m.name}님을 다시 승인 대기로 돌렸습니다.`);
  }

  async function reactivate(m: MemberRow) {
    const r = await reactivateMemberAction(m.id);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    reportSessions(`${m.name}님의 정지를 해제했습니다`, r.data.sessions);
  }

  async function setRole(m: MemberRow, role: MemberRow["role"]) {
    const r = await changeRoleAction({ id: m.id, role });
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    reportSessions(`${m.name}님의 역할을 바꿨습니다`, r.data.sessions);
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
            <TableHead className="w-10" />
            <TableHead>이름</TableHead>
            <TableHead>아이디</TableHead>
            <TableHead>소속</TableHead>
            <TableHead>역할</TableHead>
            <TableHead>상태</TableHead>
            {showPending && (
              <TableHead className="w-[26%]">가입 사유</TableHead>
            )}
            <TableHead>가입일</TableHead>
            <TableHead className="w-32 text-right">처리</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((m) => (
            <TableRow key={m.id}>
              <TableCell>
                {/*
                  일괄 동작이 「일괄 승인」 하나뿐인데 모든 행에 체크박스를 두면
                  **반드시 실패하는 선택을 화면이 권하는 것**이 됩니다.
                */}
                {canAttempt("APPROVE", m.status) && (
                  <Checkbox
                    checked={selected.includes(m.id)}
                    onCheckedChange={() => toggle(m.id)}
                    aria-label={`${m.name} 선택`}
                  />
                )}
              </TableCell>
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
                <RoleBadge role={m.role} />
              </TableCell>
              <TableCell>
                <UserStatusBadge status={m.status} />
              </TableCell>
              {showPending && (
                <TableCell className="text-muted-foreground text-xs">
                  {m.signupReason ?? "-"}
                </TableCell>
              )}
              <TableCell className="text-muted-foreground text-xs">
                {m.createdAt.slice(0, 10)}
              </TableCell>
              <TableCell className="text-right">
                {m.status === "PENDING" ? (
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => onAction(() => approve(m))}
                    >
                      <Check className="size-3.5" />
                      승인
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => onReject(m)}
                      aria-label={`${m.name} 거부`}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ) : (
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
                      {canAttempt("CHANGE_ROLE", m.status) && (
                        <>
                          <DropdownMenuSeparator />
                          {(["MEMBER", "EDITOR", "ADMIN"] as const)
                            .filter((r) => r !== m.role)
                            .map((r) => (
                              <DropdownMenuItem
                                key={r}
                                onSelect={() => onAction(() => setRole(m, r))}
                              >
                                역할을 {r} 로 변경
                              </DropdownMenuItem>
                            ))}
                        </>
                      )}
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
                      {canAttempt("REOPEN", m.status) && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => onAction(() => reopen(m))}
                          >
                            거부 취소 (다시 검토)
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
                )}
              </TableCell>
            </TableRow>
          ))}
          {list.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={showPending ? 9 : 8}
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

type BulkFailure = {
  id: string;
  username?: string;
  code: string;
  message: string;
};

/**
 * 일괄 처리 실패 목록 (`DEC-039`).
 *
 * 토스트에 넣지 않는 이유: 실패가 5건만 넘어도 화면을 덮고, **어느 회원인지**를
 * 읽을 수 없습니다. 부분 성공을 택한 이유가 「어느 건이 문제였는지 알게 한다」인데
 * 결과가 그것을 못 말하면 롤백과 다를 게 없습니다.
 */
function BulkFailureDialog({
  failures,
  onClose,
}: {
  failures: BulkFailure[] | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={failures !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {failures?.length ?? 0}명을 처리하지 못했습니다
          </DialogTitle>
          <DialogDescription>
            나머지는 처리됐습니다. 되돌리지 않습니다.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
          {failures?.map((f) => (
            <li key={f.id} className="border-b pb-2 last:border-0">
              <p className="font-medium">{f.username ?? "(삭제된 회원)"}</p>
              <p className="text-muted-foreground text-xs">{f.message}</p>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button onClick={onClose}>닫기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 사유 입력이 필요한 처리 — 거부·정지 (REQ-02 · 2.4절) */
function ReasonDialog({
  target,
  title,
  hint,
  onClose,
  onSubmit,
}: {
  target: MemberRow | null;
  title: string;
  /** 이 사유가 **어디까지 가는지** 관리자에게 정확히 말한다 (`DEC-041`) */
  hint: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(o) => {
        if (!o) {
          setReason("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{hint}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reason">사유</Label>
          <Textarea
            id="reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            {reason.trim().length} / {REASON_MIN_LENGTH}자 이상
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button
            disabled={!isReasonLongEnough(reason) || pending}
            onClick={async () => {
              setPending(true);
              await onSubmit(reason.trim());
              setPending(false);
              setReason("");
            }}
          >
            {pending ? "처리 중…" : "확인"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MemberTable({ members }: { members: MemberRow[] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  const [rejecting, setRejecting] = useState<MemberRow | null>(null);
  const [suspending, setSuspending] = useState<MemberRow | null>(null);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [bulkFailed, setBulkFailed] = useState<BulkFailure[] | null>(null);

  const toggle = (id: string) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
    );

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
      if (role !== "all" && m.role !== role) return false;
      if (!q) return true;
      const n = q.toLowerCase();
      // 이름도 소문자로 맞춘다 — 아이디만 대소문자를 무시하면 규칙이 둘이 된다
      return (
        m.name.toLowerCase().includes(n) || m.username.toLowerCase().includes(n)
      );
    });

  const pending = filter("PENDING");

  /**
   * 선택한 것 중 **실제로 승인 가능한 것**만 추립니다.
   *
   * 체크박스는 모든 탭에 있어서 정지·탈퇴 회원이 섞입니다. 그대로 보내면 서버가
   * 전부 `INVALID_STATE` 로 떨어뜨리고 관리자는 이유 없는 실패 목록을 봅니다.
   * **화면이 서버 판정을 흉내내는 것이 아니라**(`LAST_ADMIN` 같은 동시성 판정은
   * 여전히 서버 몫입니다) 「명백히 불가능한 요청을 보내지 않는」 것입니다.
   */
  const selectedApprovable = selected.filter((id) => {
    const m = members.find((x) => x.id === id);
    return m ? canAttempt("APPROVE", m.status) : false;
  });

  /** 일괄 승인은 **부분 성공**이다 (DEC-039) — 성공·실패를 나눠 보고한다 */
  async function bulkApprove() {
    const r = await approveMembersAction({ ids: selectedApprovable });
    if (!r.ok) {
      toast.error(r.message);
      return;
    }

    const { succeeded, failed } = r.data;
    setSelected([]);

    // 무효화가 실패한 건은 별도로 센다 — 그 사람들은 승인됐는데 못 들어간다
    const stale = succeeded.filter((s) => !s.sessions.cacheInvalidated).length;

    if (failed.length === 0) {
      if (stale === 0) {
        toast.success(`${succeeded.length}명을 승인했습니다.`);
        return;
      }
      toast.warning(`${succeeded.length}명을 승인했습니다`, {
        description: `${stale}명은 캐시 무효화에 실패해 최대 15분간 승인 대기 화면이 보일 수 있습니다.`,
        duration: 10_000,
      });
      return;
    }

    // 이름 없이 같은 메시지를 N번 늘어놓지 않는다 — 어느 회원인지가 요점이다
    setBulkFailed(failed);
  }

  const rows = (list: MemberRow[]) => (
    <MemberRows
      list={list}
      selected={selected}
      toggle={toggle}
      onReject={setRejecting}
      onSuspend={setSuspending}
      onAction={run}
      busy={busy}
    />
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
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 역할</SelectItem>
            <SelectItem value="MEMBER">일반 회원</SelectItem>
            <SelectItem value="EDITOR">편집자</SelectItem>
            <SelectItem value="ADMIN">관리자</SelectItem>
          </SelectContent>
        </Select>

        {selected.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-muted-foreground text-sm">
              {selected.length}명 선택됨
              {selectedApprovable.length !== selected.length && (
                <> · 승인 가능 {selectedApprovable.length}명</>
              )}
            </span>
            <Button
              size="sm"
              disabled={busy || selectedApprovable.length === 0}
              onClick={() => run(bulkApprove)}
            >
              일괄 승인
              {selectedApprovable.length > 0 &&
                ` ${selectedApprovable.length}명`}
            </Button>
          </div>
        )}
      </div>

      {pending.length > 0 && (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <TriangleAlert className="size-3.5" />
          승인 결과는 메일로 가지 않습니다. 신청자는 직접 확인해야 합니다.
        </p>
      )}

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            승인 대기 ({pending.length})
          </TabsTrigger>
          <TabsTrigger value="all">전체 ({filter().length})</TabsTrigger>
          <TabsTrigger value="suspended">
            정지 ({filter("SUSPENDED").length})
          </TabsTrigger>
          <TabsTrigger value="withdrawn">
            탈퇴 ({filter("WITHDRAWN").length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {rows(pending)}
        </TabsContent>
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
        target={rejecting}
        title={`${rejecting?.name ?? ""}님의 가입을 거부합니다`}
        hint="사유는 본인이 다음에 로그인할 때 그대로 보입니다. 감사 로그에도 남습니다."
        onClose={() => setRejecting(null)}
        onSubmit={(reason) =>
          run(async () => {
            const m = rejecting;
            if (!m) return;
            const r = await rejectMemberAction({ id: m.id, reason });
            setRejecting(null);
            if (!r.ok) {
              toast.error(r.message);
              return;
            }
            toast.success(`${m.name}님의 가입을 거부했습니다.`);
          })
        }
      />

      <ReasonDialog
        target={suspending}
        title={`${suspending?.name ?? ""}님을 정지합니다`}
        hint="사유는 감사 로그와 관리자 화면에만 남습니다. 본인에게는 전달되지 않습니다."
        onClose={() => setSuspending(null)}
        onSubmit={(reason) =>
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

      <BulkFailureDialog
        failures={bulkFailed}
        onClose={() => setBulkFailed(null)}
      />
    </div>
  );
}
