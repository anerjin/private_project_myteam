"use client";

import { ChevronsUpDown, LogOut, UserCog } from "lucide-react";
import Link from "next/link";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export interface NavUserData {
  name: string;
  username: string;
  /** DB 에서 nullable 이다 (TBL-users). 없는 사람이 있다 */
  department?: string;
}

/*
 * `roleLabel` 이 여기 있었고 아이디 옆에 「@master · 관리자」로 붙었습니다.
 * **지웠습니다** (`DEC-077`) — 모두가 같은 하나이면 그 자리는 아무도 구분하지
 * 않으면서 자리만 차지합니다. 소속은 아래 드롭다운이 이미 보여 줍니다.
 */

/** 표현 전용. 사용자 데이터는 라우트 레이아웃에서 주입한다 (DEV-06 · 6.9절) */
export function NavUser({ user }: { user: NavUserData }) {
  const { isMobile } = useSidebar();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent"
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg">
                  {user.name.slice(0, 1)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="text-muted-foreground truncate text-xs">
                  @{user.username}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
              {user.department}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/me">
                <UserCog className="size-4" /> 마이페이지
              </Link>
            </DropdownMenuItem>
            {/*
              **「API 키 관리」를 뺐습니다.**

              바로 위 「마이페이지」와 **같은 `/me` 로 가고 있었습니다** —
              보안 탭으로도 안 갔습니다. 이름이 약속한 곳에 데려다주지 않는
              문이라, 「있는데 안 된다」의 약한 형태였습니다.

              키 발급은 마이페이지 > 보안에 그대로 있습니다(`FR-USER-008`).
              팀 스무 명 중 자기 PC 에 MCP 를 붙일 사람은 소수인데, 상시
              메뉴에 둘 이유가 없습니다.
            */}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/login">
                <LogOut className="size-4" /> 로그아웃
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
