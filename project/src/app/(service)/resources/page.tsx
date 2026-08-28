import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { ResourceBrowser } from "@/features/resources/components/resource-browser";
import { parseListQuery, PAGE_SIZE } from "@/features/resources/list.schema";
import { requireActiveUser } from "@/server/auth/guards";
import * as categoryService from "@/server/services/category.service";
import { listAuthors } from "@/server/services/resource.service";
import * as resourceService from "@/server/services/resource.service";

export const metadata: Metadata = { title: "전체 자료" };

/**
 * SCR-111 자료 목록 (전체).
 *
 * **`searchParams` 가 목록 상태의 정본입니다** (`DEC-045`).
 * 사람이 URL 을 손으로 고치기도 하는 곳이라 zod 로 파싱하고
 * **실패는 오류 화면이 아니라 기본값**으로 떨어뜨립니다 — 링크를 잘못 복사한
 * 사람이 500 을 보면 안 됩니다.
 */
export default async function ResourcesPage({
  searchParams,
}: PageProps<"/resources">) {
  // 인가는 레이아웃이 아니라 page 가 한다 (DEC-035)
  const session = await requireActiveUser();

  // Next.js 16 에서 searchParams 는 Promise 다
  const query = parseListQuery(await searchParams);

  const [page, authors, categories] = await Promise.all([
    resourceService.list(
      query,
      { kind: "cursor", after: query.cursor, size: PAGE_SIZE },
      session.userId
    ),
    listAuthors(),
    categoryService.listChoices(),
  ]);

  return (
    <>
      <PageHeader
        description="팀이 모은 모든 자료입니다. 승인된 회원은 전부 열람할 수 있습니다."
        action={
          <Button asChild>
            <Link href="/resources/new">
              <Plus className="size-4" />
              자료 등록
            </Link>
          </Button>
        }
      />
      <ResourceBrowser
        resources={page.items}
        query={query}
        authors={authors}
        categories={categories}
        searchTruncated={page.searchTruncated}
        nextCursor={page.nextCursor}
      />
    </>
  );
}
