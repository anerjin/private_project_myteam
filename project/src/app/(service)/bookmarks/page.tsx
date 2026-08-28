import { BookMarked } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { ResourceBrowser } from "@/features/resources/components/resource-browser";
import { resources } from "@/mocks";

export const metadata: Metadata = { title: "북마크" };

/** SCR-133 내 북마크 */
export default function BookmarksPage() {
  const list = resources.filter((r) => r.bookmarked);

  return (
    <>
      <PageHeader title="내 북마크" count={list.length} />
      {list.length === 0 ? (
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
        <ResourceBrowser resources={list} />
      )}
    </>
  );
}
