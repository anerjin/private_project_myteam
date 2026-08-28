"use client";

import { LayoutGrid, List, Plus, SearchX } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { TypeBadge } from "@/features/resources/components/badges";
import { ResourceCard } from "@/features/resources/components/resource-card";
import { getContentType } from "@/features/resources/content-types";
import {
  SORT_KEYS,
  SORT_LABEL,
  toSearchParams,
  type ListQuery,
  type SortKey,
} from "@/features/resources/list.schema";
import type { CategoryChoice, Resource } from "@/types";

/**
 * 자료 목록 (SCR-111, FR-RES-004~006).
 *
 * ## 상태의 정본은 **URL** 입니다 (`DEC-045`)
 *
 * 전에는 이 컴포넌트가 필터·정렬·페이징을 **전부 클라이언트에서** 했습니다.
 * 주석에 *"실제 구현에서는 커서 기반 페이지네이션"* 이라고 스스로 적어 둔 채로요.
 * 그 구조는 **전체 자료를 매 요청 RSC 페이로드로 보내야** 성립하고,
 * 1만 건에서는 성립하지 않습니다 (`DEV-07 · 7.4` DoD: P95 500ms).
 *
 * 지금은 조건을 바꾸면 **URL 이 바뀌고 서버가 다시 질의합니다.**
 * 새로고침·뒤로가기·링크 공유가 전부 따라옵니다.
 *
 * > 등록자 목록을 **서버가 줍니다.** 화면이 가진 자료에서 뽑으면
 * > 서버 페이징 뒤에는 «현재 페이지의 등록자»만 보여 필터가 거짓말을 합니다.
 */

/** 보기 방식은 URL 에 넣지 않습니다 — 서버 질의에 들어가지 않는 순수 표현 상태입니다 */
type View = "card" | "table";

export interface AuthorOption {
  username: string;
  name: string;
}

export function ResourceBrowser({
  resources,
  query,
  authors,
  categories,
  nextCursor,
  total,
  searchTruncated,
  controls = true,
}: {
  resources: Resource[];
  /** 서버가 파싱한 «지금» 조건 */
  query: ListQuery;
  authors: AuthorOption[];
  /**
   * 카테고리 선택지도 **서버가 줍니다** — 등록자 목록과 같은 이유이자,
   * 전에 `config/site.ts` 의 상수를 읽던 자리입니다. 그 상수는 대분류 5개뿐이라
   * DB 의 하위분류 22개를 **필터로 고를 수 없었습니다.**
   */
  categories: CategoryChoice[];
  nextCursor?: string;
  /** 관리 화면에서만 온다. 탐색 화면은 세지 않는다 */
  total?: number;
  /** 검색 후보가 상한에 닿았는가 (`DEC-048`) — 서버가 «질의로» 알아낸 값이다 */
  searchTruncated?: boolean;
  /**
   * 필터·정렬 컨트롤을 그릴지. **서버가 그 조건을 실제로 받는 화면만 `true`** 입니다 —
   * 북마크 목록처럼 조건을 안 받는 곳에 띄우면 URL 만 바뀌고 목록은 그대로라
   * 「있는데 안 된다」가 됩니다.
   */
  controls?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = useState<View>("card");

  /** 조건을 바꾸면 커서를 버린다 — 안 버리면 엉뚱한 지점부터 나온다 */
  const go = (patch: Partial<ListQuery>) =>
    router.push(pathname + toSearchParams(query, patch));

  const hasFilter = Boolean(
    query.q || query.category || query.author || query.tag || query.days
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {controls && (
          <>
            {/*
          **비제어 입력 + `key`.** 서버가 준 `q` 를 state 로 «복사»하면
          그 복사본을 다시 맞추려고 effect 에서 `setState` 를 하게 되고,
          그건 렌더 연쇄를 만듭니다(그리고 lint 가 막습니다).
          `key` 가 바뀌면 React 가 입력을 새로 만들므로 **복사 없이** 같은 결과입니다 —
          뒤로가기·필터 초기화에서 입력칸이 따라옵니다.
        */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const value = new FormData(e.currentTarget).get("q");
                go({ q: String(value ?? "").trim() || undefined });
              }}
            >
              <Input
                key={query.q ?? ""}
                name="q"
                defaultValue={query.q ?? ""}
                placeholder="제목 · 요약 검색"
                className="w-full sm:w-64"
                aria-label="자료 검색"
              />
            </form>

            <Select
              value={query.category ?? "all"}
              onValueChange={(v) =>
                go({ category: v === "all" ? undefined : v })
              }
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="카테고리" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 카테고리</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.slug} value={c.slug}>
                    {c.depth === 1 ? ` ${c.name}` : c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={query.author ?? "all"}
              onValueChange={(v) => go({ author: v === "all" ? undefined : v })}
            >
              <SelectTrigger className="w-32">
                <SelectValue placeholder="등록자" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 등록자</SelectItem>
                {authors.map((a) => (
                  <SelectItem key={a.username} value={a.username}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={query.sort}
              onValueChange={(v) => go({ sort: v as SortKey })}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_KEYS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SORT_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant={view === "card" ? "secondary" : "ghost"}
            size="icon"
            aria-label="카드 보기"
            onClick={() => setView("card")}
          >
            <LayoutGrid className="size-4" />
          </Button>
          <Button
            variant={view === "table" ? "secondary" : "ghost"}
            size="icon"
            aria-label="테이블 보기"
            onClick={() => setView("table")}
          >
            <List className="size-4" />
          </Button>
        </div>
      </div>

      <p className="text-muted-foreground text-sm">
        {total !== undefined
          ? `${total}건`
          : `${resources.length}건 표시 중${nextCursor ? " · 더 있습니다" : ""}`}
      </p>

      {/*
        **잘렸다는 사실을 질의가 알려 줍니다** (`DEC-048`). 검색은 관련도 상위
        2000건 «안에서만» 필터·정렬·페이징합니다. 조용히 자르면 사용자는
        「없다」와 「안 보여준다」를 구별할 수 없고, 「최신순으로 봤는데 어제 글이
        없다」를 버그로 신고하게 됩니다.
      */}
      {searchTruncated && (
        <Alert>
          <AlertDescription>
            검색 결과가 많아 <b>관련도 상위 2,000건 안에서만</b> 추리고
            정렬했습니다. 뒤쪽 자료는 이 목록에 없으니 검색어를 좁히거나 타입 ·
            카테고리 필터를 함께 걸어 주세요.
          </AlertDescription>
        </Alert>
      )}

      {resources.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="조건에 맞는 자료가 없습니다"
          description={
            query.q
              ? `«${query.q}» 로 찾은 자료가 없습니다. 직접 등록해 두면 다음 사람이 찾습니다.`
              : "필터를 바꾸거나 초기화해 보세요."
          }
          action={
            <div className="flex gap-2">
              {hasFilter && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={pathname}>필터 초기화</Link>
                </Button>
              )}
              <Button size="sm" asChild>
                <Link href="/resources/new">
                  <Plus className="size-4" />이 주제로 자료 등록하기
                </Link>
              </Button>
            </div>
          }
        />
      ) : view === "card" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {resources.map((r) => (
            <ResourceCard key={r.id} resource={r} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[36%]">제목</TableHead>
                <TableHead>타입</TableHead>
                <TableHead>태그</TableHead>
                <TableHead>등록자</TableHead>
                <TableHead className="text-right">조회</TableHead>
                <TableHead>등록일</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resources.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link
                      href={`/resources/${getContentType(r.type).slug}/${r.slug}`}
                      className="hover:text-primary flex items-center gap-2 font-medium"
                    >
                      <span className="truncate">{r.title}</span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <TypeBadge type={r.type} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {r.tags
                      .slice(0, 3)
                      .map((t) => `#${t}`)
                      .join(" ")}
                  </TableCell>
                  <TableCell className="text-sm">{r.author.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.viewCount}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {r.createdAt.slice(0, 10)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {nextCursor && (
        <div className="flex justify-center pt-2">
          {/*
            **`Link` 입니다.** 커서를 URL 에 실어야 「이 지점부터」가 공유·새로고침에서
            살아남습니다. 클라이언트 state 로 누적하면 새로고침에 처음으로 돌아갑니다.
          */}
          <Button variant="outline" asChild>
            <Link
              href={pathname + toSearchParams(query, { cursor: nextCursor })}
            >
              더 보기
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
