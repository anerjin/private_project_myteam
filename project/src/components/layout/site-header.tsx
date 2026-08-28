"use client";

import { Bell, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

export interface SearchItem {
  id: string;
  title: string;
  typeLabel: string;
  keywords: string;
  href: string;
}

export interface HeaderNotification {
  id: string;
  title: string;
  body?: string;
  read: boolean;
}

/** 표현 전용 헤더. 검색 후보·알림은 라우트 레이아웃이 주입한다. */
export function SiteHeader({
  title,
  searchItems,
  notifications,
  actions,
}: {
  title?: string;
  searchItems: SearchItem[];
  notifications: HeaderNotification[];
  /** 헤더 우측에 끼워 넣을 추가 요소 (예: 프로토타입 사용자 전환기) */
  actions?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="bg-background sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 !h-4" />
      {title && <h1 className="text-sm font-medium">{title}</h1>}

      <div className="flex-1" />

      {actions}

      <Button
        variant="outline"
        size="sm"
        className="text-muted-foreground hidden w-56 justify-start gap-2 font-normal sm:flex"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
        검색…
        <kbd className="bg-muted ml-auto rounded px-1.5 py-0.5 text-[10px]">
          Ctrl K
        </kbd>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="sm:hidden"
        aria-label="검색"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={unread > 0 ? `알림 ${unread}건` : "알림"}
          >
            <Bell className="size-4" />
            {unread > 0 && (
              <span className="bg-destructive absolute top-1.5 right-1.5 size-2 rounded-full" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel className="flex items-center justify-between">
            알림
            {unread > 0 && <Badge variant="secondary">{unread}</Badge>}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {notifications.map((n) => (
            <DropdownMenuItem
              key={n.id}
              className="flex-col items-start gap-0.5 py-2"
            >
              <span className="text-sm font-medium">{n.title}</span>
              {n.body && (
                <span className="text-muted-foreground text-xs">{n.body}</span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <ThemeToggle />

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="자료 제목 · 태그로 검색…" />
        <CommandList>
          <CommandEmpty>결과가 없습니다.</CommandEmpty>
          <CommandGroup heading="자료">
            {searchItems.map((item) => (
              <CommandItem key={item.id} value={item.keywords} asChild>
                <Link href={item.href} onClick={() => setOpen(false)}>
                  <span className="truncate">{item.title}</span>
                  <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                    {item.typeLabel}
                  </span>
                </Link>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </header>
  );
}
