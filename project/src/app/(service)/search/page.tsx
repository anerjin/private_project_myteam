import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResourceBrowser } from "@/features/resources/components/resource-browser";
import { listContentTypes } from "@/features/resources/content-types";
import {
  parseListQuery,
  PAGE_SIZE,
  toSearchParams,
} from "@/features/resources/list.schema";
import { requireActiveUser } from "@/server/auth/guards";
import * as resourceService from "@/server/services/resource.service";

export const metadata: Metadata = { title: "검색" };

/**
 * SCR-121 검색 결과.
 *
 * 사이드바의 타입·태그는 **집계**라 목록과 다른 질의입니다.
 * 태그를 누르면 `?tag=` 가 붙어 **같은 URL 상태**로 합류합니다 (`DEC-045`).
 */
export default async function SearchPage({
  searchParams,
}: PageProps<"/search">) {
  // 인가는 레이아웃이 아니라 page 가 한다 (DEC-035)
  const session = await requireActiveUser();

  const query = parseListQuery(await searchParams);

  const [page, authors, typeCounts, topTags] = await Promise.all([
    resourceService.list(
      query,
      { kind: "cursor", after: query.cursor, size: PAGE_SIZE },
      session.userId
    ),
    resourceService.listAuthors(),
    resourceService.countByType(),
    resourceService.topTags(12),
  ]);

  return (
    <>
      <PageHeader description="제목 · 요약 · 본문 · 태그를 한 번에 찾습니다. 헤더에서 Ctrl+K 로도 열 수 있습니다." />

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">타입</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {listContentTypes().map((meta) => (
                <Link
                  key={meta.code}
                  href={`/resources/${meta.slug}`}
                  className="hover:bg-muted/60 -mx-2 flex items-center justify-between rounded px-2 py-1 text-sm"
                >
                  <span>{meta.label}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {typeCounts[meta.code] ?? 0}
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">인기 태그</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {topTags.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  아직 태그가 없습니다.
                </p>
              ) : (
                topTags.map((t) => (
                  <Link
                    key={t.slug}
                    href={`/search${toSearchParams(query, { tag: t.slug })}`}
                    className="bg-muted hover:bg-muted/70 rounded px-2 py-0.5 text-xs"
                  >
                    #{t.slug}{" "}
                    <span className="text-muted-foreground">{t.count}</span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </aside>

        <ResourceBrowser
          resources={page.items}
          query={query}
          authors={authors}
          nextCursor={page.nextCursor}
        />
      </div>
    </>
  );
}
