import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { ResourceBrowser } from "@/features/resources/components/resource-browser";
import { getContentTypeBySlug } from "@/features/resources/content-types";
import { parseListQuery, PAGE_SIZE } from "@/features/resources/list.schema";
import { requireActiveUser } from "@/server/auth/guards";
import * as resourceService from "@/server/services/resource.service";

/*
 * **`generateStaticParams` 를 두지 않습니다.**
 * 이 페이지는 `requireActiveUser()`(→ `cookies()`)로 어차피 동적입니다.
 * 회원 상세에서 같은 이유로 걷어냈습니다 (`DEC-045`).
 */

export async function generateMetadata({
  params,
}: PageProps<"/resources/[type]">): Promise<Metadata> {
  const { type } = await params;
  return { title: getContentTypeBySlug(type)?.label ?? "자료" };
}

/** SCR-111 자료 목록 (타입별) — 타입이 늘어도 이 파일 하나가 처리한다 */
export default async function ResourceTypePage({
  params,
  searchParams,
}: PageProps<"/resources/[type]">) {
  // 인가는 레이아웃이 아니라 page 가 한다 (DEC-035)
  const session = await requireActiveUser();

  const { type } = await params;
  const meta = getContentTypeBySlug(type);
  if (!meta) notFound();

  /*
   * URL 의 `type` 은 **경로 세그먼트**가 이깁니다 —
   * `/resources/ai-material?type=SKILL` 이 스킬 목록을 보여주면 안 됩니다.
   */
  const query = { ...parseListQuery(await searchParams), type: meta.code };

  const [page, authors] = await Promise.all([
    resourceService.list(
      query,
      { kind: "cursor", after: query.cursor, size: PAGE_SIZE },
      session.userId
    ),
    resourceService.listAuthors(),
  ]);

  return (
    <>
      <PageHeader
        description={meta.description}
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
        nextCursor={page.nextCursor}
      />
    </>
  );
}
