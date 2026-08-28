"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandMark } from "@/components/layout/brand-mark";
import { NavUser, type NavUserData } from "@/components/layout/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import type { NavGroup, NavItem } from "@/config/navigation";
import { SITE } from "@/config/site";

/** 정확히 일치해야 하는 경로 (하위 경로에서 활성 처리하면 안 되는 것) */
const EXACT = new Set(["/resources", "/admin", "/dashboard"]);

/**
 * 표현 전용 사이드바. 메뉴·사용자 데이터는 라우트 레이아웃이 주입한다.
 * `components/` 는 `features/` 를 참조할 수 없다 (DEV-06 · 6.9절).
 */
export function AppSidebar({
  variant = "service",
  groups,
  user,
  adminEntry,
}: {
  variant?: "service" | "admin";
  groups: NavGroup[];
  user: NavUserData;
  /** 서비스 영역에서 ADMIN 에게만 보여줄 관리자 진입 메뉴 */
  adminEntry?: NavItem;
}) {
  const pathname = usePathname();
  const isAdmin = variant === "admin";

  const isActive = (href: string) =>
    EXACT.has(href) ? pathname === href : pathname.startsWith(href);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href={isAdmin ? "/admin" : "/dashboard"}>
                <BrandMark />
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">{SITE.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {isAdmin ? "관리자" : SITE.description}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="서비스로 돌아가기">
                    <Link href="/dashboard">
                      <ArrowLeft />
                      <span>서비스로 돌아가기</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {groups.map((group, i) => (
          <SidebarGroup key={group.label ?? `g${i}`}>
            {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.href)}
                      tooltip={item.title}
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.badge ? (
                      <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        {!isAdmin && adminEntry && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip={adminEntry.title}>
                      <Link href={adminEntry.href}>
                        <adminEntry.icon />
                        <span>{adminEntry.title}</span>
                      </Link>
                    </SidebarMenuButton>
                    {adminEntry.badge ? (
                      <SidebarMenuBadge>{adminEntry.badge}</SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
