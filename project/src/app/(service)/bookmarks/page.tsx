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

  const query = parseListQuery(await searchParams);
  const [page, authors] = await Promise.all([
    resourceService.listBookmarked(session.userId, {
      kind: "offset",
      page: 1,
      size: PAGE_SIZE,
    }),
    resourceService.listAuthors(),
  ]);

  return (
    <>
      <PageHeader count={page.total ?? page.items.length} />
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
          total={page.total}
        />
      )}
    </>
  );
}
