import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResourceBrowser } from "@/features/resources/components/resource-browser";
import { listContentTypes } from "@/features/resources/content-types";
import { resources } from "@/mocks";
import { requireActiveUser } from "@/server/auth/guards";

export const metadata: Metadata = { title: "검색" };

/** SCR-121 검색 결과 */
export default async function SearchPage() {
  // 인가는 레이아웃이 아니라 page 가 한다 (DEC-035)
  await requireActiveUser();

  const byType = listContentTypes().map((t) => ({
    meta: t,
    count: resources.filter((r) => r.type === t.code).length,
  }));
  const tagCounts = Object.entries(
    resources
      .flatMap((r) => r.tags)
      .reduce<Record<string, number>>((acc, t) => {
        acc[t] = (acc[t] ?? 0) + 1;
        return acc;
      }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

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
              {byType.map(({ meta, count }) => (
                <Link
                  key={meta.code}
                  href={`/resources/${meta.slug}`}
                  className="hover:bg-muted/60 -mx-2 flex items-center justify-between rounded px-2 py-1 text-sm"
                >
                  <span>{meta.label}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {count}
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
              {tagCounts.map(([tag, n]) => (
                <span
                  key={tag}
                  className="bg-muted rounded px-2 py-0.5 text-xs"
                >
                  #{tag} <span className="text-muted-foreground">{n}</span>
                </span>
              ))}
            </CardContent>
          </Card>
        </aside>

        <ResourceBrowser resources={resources} />
      </div>
    </>
  );
}
