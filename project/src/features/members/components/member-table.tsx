"use client";

import { Check, MoreHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import {
  RoleBadge,
  UserStatusBadge,
} from "@/features/members/components/badges";
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
import { members } from "@/mocks";
import type { Member, UserStatus } from "@/types";

function MemberRows({
  list,
  selected,
  toggle,
  onReject,
}: {
  list: Member[];
  selected: string[];
  toggle: (id: string) => void;
  onReject: (m: Member) => void;
}) {
  const showPending = list.some((m) => m.status === "PENDING");

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
                <Checkbox
                  checked={selected.includes(m.id)}
                  onCheckedChange={() => toggle(m.id)}
                  aria-label={`${m.name} 선택`}
                />
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
              <TableCell className="text-sm">{m.department}</TableCell>
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
                      onClick={() =>
                        toast.success(`${m.name}님을 승인했습니다.`)
                      }
                    >
                      <Check className="size-3.5" />
                      승인
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onReject(m)}
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
                      <DropdownMenuItem>역할 변경</DropdownMenuItem>
                      <DropdownMenuItem>비밀번호 초기화</DropdownMenuItem>
                      <DropdownMenuItem>API 키 강제 폐기</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {m.status === "SUSPENDED" ? (
                        <DropdownMenuItem>정지 해제</DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem className="text-destructive">
                          정지
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function MemberTable() {
  const [selected, setSelected] = useState<string[]>([]);
  const [rejecting, setRejecting] = useState<Member | null>(null);
  const [reason, setReason] = useState("");
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");

  const toggle = (id: string) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
    );

  const filter = (status?: UserStatus) =>
    members.filter((m) => {
      if (status && m.status !== status) return false;
      if (role !== "all" && m.role !== role) return false;
      if (!q) return true;
      const n = q.toLowerCase();
      return m.name.includes(q) || m.username.toLowerCase().includes(n);
    });

  const pending = filter("PENDING");

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
            </span>
            <Button
              size="sm"
              onClick={() => {
                toast.success(`${selected.length}명을 승인했습니다.`);
                setSelected([]);
              }}
            >
              일괄 승인
            </Button>
          </div>
        )}
      </div>

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
          <MemberRows
            list={pending}
            selected={selected}
            toggle={toggle}
            onReject={setRejecting}
          />
        </TabsContent>
        <TabsContent value="all" className="mt-4">
          <MemberRows
            list={filter()}
            selected={selected}
            toggle={toggle}
            onReject={setRejecting}
          />
        </TabsContent>
        <TabsContent value="suspended" className="mt-4">
          <MemberRows
            list={filter("SUSPENDED")}
            selected={selected}
            toggle={toggle}
            onReject={setRejecting}
          />
        </TabsContent>
        <TabsContent value="withdrawn" className="mt-4 space-y-3">
          <p className="text-muted-foreground text-sm">
            탈퇴해도 계정 행은 남습니다. 이름은 즉시 마스킹하고 1년 뒤
            익명화하며,
            <b> 아이디는 재사용되지 않습니다.</b>
          </p>
          <MemberRows
            list={filter("WITHDRAWN")}
            selected={selected}
            toggle={toggle}
            onReject={setRejecting}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>가입 거부</DialogTitle>
            <DialogDescription>
              거부 사유는 신청자에게 그대로 전달됩니다. 10자 이상 입력해 주세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">
              거부 사유 — {rejecting?.name} (@{rejecting?.username})
            </Label>
            <Textarea
              id="reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              취소
            </Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 10}
              onClick={() => {
                toast.success(`${rejecting?.name}님의 가입을 거부했습니다.`);
                setRejecting(null);
                setReason("");
              }}
            >
              거부
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
