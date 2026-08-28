"use client";

import { LayoutGrid, List, Plus, SearchX } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ReviewBadge, TypeBadge } from "@/features/resources/components/badges";
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
import { Toggle } from "@/components/ui/toggle";
import { CATEGORIES } from "@/config/site";
import { ResourceCard } from "@/features/resources/components/resource-card";
import type { Resource } from "@/types";
import { getContentType } from "@/features/resources/content-types";

type Sort = "latest" | "popular" | "bookmarked" | "title";

const PAGE_SIZE = 9;

export function ResourceBrowser({ resources }: { resources: Resource[] }) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [author, setAuthor] = useState("all");
  const [sort, setSort] = useState<Sort>("latest");
  const [onlyReview, setOnlyReview] = useState(false);
  const [view, setView] = useState<"card" | "table">("card");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const authors = useMemo(
    () =>
      Array.from(new Set(resources.map((r) => r.author.name))).sort((a, b) =>
        a.localeCompare(b, "ko")
      ),
    [resources]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = resources.filter((r) => {
      if (onlyReview && !r.needsReview) return false;
      if (category !== "all" && r.category !== category) return false;
      if (author !== "all" && r.author.name !== author) return false;
      if (!needle) return true;
      return (
        r.title.toLowerCase().includes(needle) ||
        (r.summary ?? "").toLowerCase().includes(needle) ||
        r.tags.some((t) => t.includes(needle))
      );
    });

    return [...list].sort((a, b) => {
      if (sort === "popular") return b.viewCount - a.viewCount;
      if (sort === "bookmarked") return b.bookmarkCount - a.bookmarkCount;
      if (sort === "title") return a.title.localeCompare(b.title, "ko");
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [resources, q, category, author, sort, onlyReview]);

  /**
   * 목록은 한 번에 다 뿌리지 않고 «더 보기» 로 늘린다.
   * 실제 구현에서는 커서 기반 페이지네이션이다 — OFFSET 은 쓰지 않는다 (NFR-PERF-001).
   */
  const visible = filtered.slice(0, limit);
  const hasMore = filtered.length > visible.length;

  const reset = () => {
    setQ("");
    setCategory("all");
    setAuthor("all");
    setOnlyReview(false);
    setLimit(PAGE_SIZE);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="제목 · 요약 · 태그 검색"
          className="w-full sm:w-64"
        />

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="카테고리" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 카테고리</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.slug} value={c.slug}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={author} onValueChange={setAuthor}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="등록자" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 등록자</SelectItem>
            {authors.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="latest">최신순</SelectItem>
            <SelectItem value="popular">조회순</SelectItem>
            <SelectItem value="bookmarked">북마크순</SelectItem>
            <SelectItem value="title">제목순</SelectItem>
          </SelectContent>
        </Select>

        <Toggle
          pressed={onlyReview}
          onPressedChange={setOnlyReview}
          variant="outline"
          size="sm"
        >
          검수 대기만
        </Toggle>

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
        {visible.length}건 표시 중 (조건 일치 {filtered.length}건 · 전체{" "}
        {resources.length}건)
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="조건에 맞는 자료가 없습니다"
          description={
            q.trim()
              ? `«${q.trim()}» 로 찾은 자료가 없습니다. 직접 등록해 두면 다음 사람이 찾습니다.`
              : "필터를 바꾸거나 초기화해 보세요."
          }
          action={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={reset}>
                필터 초기화
              </Button>
              <Button size="sm" asChild>
                <Link href="/resources/new">
                  <Plus className="size-4" />
                  이 주제로 자료 등록하기
                </Link>
              </Button>
            </div>
          }
        />
      ) : view === "card" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((r) => (
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
              {visible.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link
                      href={`/resources/${getContentType(r.type).slug}/${r.slug}`}
                      className="hover:text-primary flex items-center gap-2 font-medium"
                    >
                      <span className="truncate">{r.title}</span>
                      {r.needsReview && <ReviewBadge />}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <TypeBadge type={r.type} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {r.tags.slice(0, 3).map((t) => `#${t}`).join(" ")}
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

      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            onClick={() => setLimit((n) => n + PAGE_SIZE)}
          >
            더 보기
            <span className="text-muted-foreground ml-1 text-xs tabular-nums">
              (남은 {filtered.length - visible.length}건)
            </span>
          </Button>
        </div>
      )}
    </div>
  );
}
