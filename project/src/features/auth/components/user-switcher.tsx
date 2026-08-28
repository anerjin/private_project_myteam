"use client";

import { FlaskConical } from "lucide-react";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { switchMockUserAction } from "@/features/auth/actions";

export interface SwitchableUser {
  username: string;
  name: string;
  roleLabel: string;
}

/**
 * 프로토타입 전용 사용자 전환기.
 * 역할별 화면(관리자 메뉴 노출, 남의 자료 수정 버튼 등)을 눈으로 확인하려고 둡니다.
 * **인증이 붙으면 이 컴포넌트는 삭제합니다.**
 */
export function UserSwitcher({
  users,
  current,
}: {
  users: SwitchableUser[];
  current: string;
}) {
  const [pending, startTransition] = useTransition();

  function switchTo(username: string) {
    startTransition(() => switchMockUserAction(username));
  }

  const now = users.find((u) => u.username === current);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 border-dashed"
          aria-label="목 사용자 전환"
          disabled={pending}
        >
          <FlaskConical className="size-3.5" />
          <span className="hidden md:inline">
            {pending ? "전환 중…" : (now?.roleLabel ?? "역할")}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
          프로토타입 전용 — 역할별 화면 확인용
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {users.map((u) => (
          <DropdownMenuItem
            key={u.username}
            onClick={() => switchTo(u.username)}
            className="flex-col items-start gap-0.5"
          >
            <span className="text-sm font-medium">
              {u.name}
              {u.username === current && (
                <span className="text-muted-foreground ml-1.5 text-xs">
                  현재
                </span>
              )}
            </span>
            <span className="text-muted-foreground text-xs">
              @{u.username} · {u.roleLabel}
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
          일반 회원으로 바꾸면 관리자 메뉴가 사라지고, 남의 자료에는 수정·삭제
          버튼이 보이지 않습니다.
        </DropdownMenuLabel>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
