"use client";

import { Bell, Search } from "lucide-react";
import { useRouter } from "next/navigation";
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

/** 표현 전용 헤더. 검색 후보·알림·빵부스러기는 라우트 레이아웃이 주입한다. */
export function SiteHeader({
  title,
  breadcrumb,
  searchItems,
  notifications,
  actions,
}: {
  /**
   * 고정 타이틀. **아직 빵부스러기로 옮기지 않은 관리자 영역**만 쓴다.
   * 서비스 영역은 `breadcrumb` 의 마지막 조각이 타이틀 역할을 한다.
   */
  title?: string;
  /** 사이드바 토글 오른쪽에 한 줄로 들어가는 빵부스러기 (DEV-03 · 3.4절) */
  breadcrumb?: React.ReactNode;
  searchItems: SearchItem[];
  notifications: HeaderNotification[];
  /** 헤더 우측에 끼워 넣을 추가 요소 (예: 프로토타입 사용자 전환기) */
  actions?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  /** 팔레트에 친 말 — 「전체 검색」이 이 값을 `/search` 로 넘긴다 (`FR-SRCH-002`) */
  const [query, setQuery] = useState("");
  const router = useRouter();

  /*
   * **`CommandItem asChild` 를 쓰지 않습니다.**
   *
   * 안에 `<Link>` 를 넣고 `asChild` 를 주면 cmdk 가 Radix `Slot` 으로 넘기다
   * **`Primitive.div failed to slot onto its children`** 로 터지고, 그 오류가
   * `Command` 서브트리 전체를 무너뜨립니다 — 다이얼로그는 열리는데 **안이
   * 통째로 비어** 있게 됩니다. 서버 HTML 만 보는 검증으로는 안 보이고,
   * E2E 가 브라우저를 띄우자마자 나왔습니다.
   *
   * `onSelect` 로 옮기면 **키보드 Enter 도 같은 길**을 탑니다 — `asChild` +
   * `<Link>` 는 마우스 클릭만 동작했습니다.
   */
  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }
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
      {title && <h1 className="shrink-0 text-sm font-medium">{title}</h1>}

      {/* 빵부스러기가 남는 가로 폭을 차지한다. min-w-0 이라야 긴 제목이 잘린다 */}
      <div className="min-w-0 flex-1">{breadcrumb}</div>

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

      {/*
        헤더 검색 (`FR-SRCH-002`) — 어느 화면에서든 `Ctrl+K`.

        **팔레트가 아는 것은 최근 8건뿐입니다.** 전체를 실으면 1만 건이 매
        요청 RSC 페이로드로 나갑니다. 그래서 여기서 못 찾은 것을 「결과가
        없습니다」라고 말하면 **거짓**입니다 — 시스템에는 있는데 팔레트만
        모르는 것입니다 (`DEC-044` 「0건은 증거가 아니다」와 같은 자리).

        그래서 **「전체 검색」이 항상 맨 위에** 있습니다. 친 말을 그대로 들고
        `/search` 로 넘겨, 팔레트가 모르는 것도 사람이 찾을 수 있게 합니다.
      */}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="자료 제목 · 태그로 검색…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {/*
            **`forceMount` 는 그룹에도 걸어야 합니다.**

            처음에는 항목에만 걸어 두고 「항상 보입니다」라고 적었는데, E2E 로
            팔레트를 열어 보니 본문이 「최근 자료 중에는 없습니다.」 **한 줄뿐**
            이었습니다. cmdk 는 필터에 걸린 항목이 없는 그룹을 통째로 `hidden`
            으로 만들고, 항목의 `forceMount` 는 그 계산에 들어가지 않습니다 —
            마운트는 되는데 **부모가 숨습니다.**
          */}
          {query.trim() && (
            <CommandGroup forceMount heading="전체 검색">
              <CommandItem
                forceMount
                value={`__search__${query}`}
                onSelect={() => go(`/search?q=${encodeURIComponent(query.trim())}`)}
              >
                <Search className="size-4" />
                <span className="truncate">
                  «{query.trim()}» 를 전체 자료에서 찾기
                </span>
              </CommandItem>
            </CommandGroup>
          )}
          <CommandEmpty>최근 자료 중에는 없습니다.</CommandEmpty>
          <CommandGroup heading="최근 자료">
            {searchItems.map((item) => (
              <CommandItem
                key={item.id}
                value={item.keywords}
                onSelect={() => go(item.href)}
              >
                <span className="truncate">{item.title}</span>
                <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                  {item.typeLabel}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </header>
  );
}
