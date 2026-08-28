import { BookMarked } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { ResourceBrowser } from "@/features/resources/components/resource-browser";
import { parseListQuery, PAGE_SIZE } from "@/features/resources/list.schema";
import { requireActiveUser } from "@/server/auth/guards";
import * as resourceService from "@/server/services/resource.service";

export const metadata: Metadata = { title: "북마크" };

/** SCR-133 내 북마크 */
export default async function BookmarksPage({
  searchParams,
}: PageProps<"/bookmarks">) {
  // 인가는 레이아웃이 아니라 page 가 한다 (DEC-035)
  const session = await requireActiveUser();

  /*
   * **`cursor` 를 실제로 씁니다.** 전에는 `{ page: 1 }` 이 하드코딩돼 있어
   * 북마크가 25개면 25번째가 **영원히 안 보였습니다** — 헤더는 「25건」이라고
   * 말하면서요. 탐색 화면이므로 커서입니다 (`DEC-045`).
   */
  const query = parseListQuery(await searchParams);
  const [page, authors] = await Promise.all([
    resourceService.listBookmarked(session.userId, {
      kind: "cursor",
      after: query.cursor,
      size: PAGE_SIZE,
    }),
    resourceService.listAuthors(),
  ]);

  return (
    <>
      <PageHeader />
      {page.items.length === 0 ? (
        <EmptyState
          icon={BookMarked}
          title="북마크한 자료가 없습니다"
          description="자료 목록이나 상세 화면에서 별을 눌러 담아두세요."
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href="/resources">자료 둘러보기</Link>
            </Button>
          }
        />
      ) : (
        <ResourceBrowser
          resources={page.items}
          query={query}
          authors={authors}
          nextCursor={page.nextCursor}
          /*
            **필터·정렬 컨트롤을 숨깁니다.** `listBookmarked` 는 그 조건을 받지
            않으므로, 보여 주면 URL 만 바뀌고 목록은 그대로입니다 —
            「있는데 안 된다」입니다. 북마크 필터는 그 기능이 생길 때 함께 옵니다.
          */
          controls={false}
        />
      )}
    </>
  );
}
