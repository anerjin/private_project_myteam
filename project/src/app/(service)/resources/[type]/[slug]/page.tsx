import { Eye, FolderPlus, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MarkdownViewer } from "@/components/common/markdown-viewer";
import {
  TableOfContents,
  extractToc,
} from "@/components/common/table-of-contents";
import { TypeBadge } from "@/features/resources/components/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CATEGORIES } from "@/config/site";
import { canEditResource } from "@/server/auth/actor";
import { requireActiveUser, toActor } from "@/server/auth/guards";
import { DeleteResourceDialog } from "@/features/resources/components/delete-resource-dialog";
import { ExternalLinkButton } from "@/features/resources/components/external-link-button";
import { TypeDetail } from "@/features/resources/components/type-detail";
import {
  getContentType,
  getContentTypeBySlug,
} from "@/features/resources/content-types";
import { ResourceActions } from "@/features/resources/components/resource-actions";
import { AppError } from "@/lib/errors";
import * as resourceService from "@/server/services/resource.service";

export async function generateMetadata({
  params,
}: PageProps<"/resources/[type]/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  try {
    const r = await resourceService.getBySlug(slug);
    return { title: r.title };
  } catch {
    return { title: "자료" };
  }
}

/** SCR-112 자료 상세 */
export default async function ResourceDetailPage({
  params,
}: PageProps<"/resources/[type]/[slug]">) {
  const session = await requireActiveUser();

  const { type, slug } = await params;
  const meta = getContentTypeBySlug(type);
  if (!meta) notFound();

  /*
   * 서비스는 `NOT_FOUND` 를 던지고 **화면이 `notFound()` 로 바꿉니다** —
   * service 가 `next/navigation` 을 알면 워커·Ingest 에서 재사용할 수 없습니다
   * (`DEV-06 · 6.6`: service 는 요청 컨텍스트에 의존하지 않는다).
   */
  let resource;
  try {
    resource = await resourceService.getBySlug(slug, session.userId);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  // 경로의 타입과 자료의 타입이 다르면 잘못된 주소다
  if (resource.type !== meta.code) notFound();

  const category = CATEGORIES.find((c) => c.slug === resource.category);
  const toc = resource.body ? extractToc(resource.body) : [];
  const canEdit = canEditResource(await toActor(session), resource.author.id);
  const related = await resourceService.findRelated(resource.id, resource.tags);

  return (
    <>
      {/* 자료 제목과 경로는 헤더 빵부스러기가 보여 준다 (DEV-03 · 3.4절) */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <TypeBadge type={resource.type} />
              {resource.sourceChannel === "MCP" && (
                <span className="text-muted-foreground font-mono text-xs">
                  CLI 수집
                </span>
              )}
            </div>
            {resource.summary && (
              <p className="text-muted-foreground">{resource.summary}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {resource.url && <ExternalLinkButton url={resource.url} />}
            <ResourceActions
              resourceId={resource.id}
              bookmarked={resource.bookmarked ?? false}
              bookmarkCount={resource.bookmarkCount}
            />
            {/* 컬렉션은 아직 없다 — 「있는데 안 된다」보다 disabled 가 정직하다 */}
            <Button variant="outline" size="sm" disabled>
              <FolderPlus className="size-4" />
              컬렉션에 담기
            </Button>
            {canEdit ? (
              <div className="ml-auto flex gap-2">
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/resources/${meta.slug}/${resource.slug}/edit`}>
                    <Pencil className="size-4" />
                    수정
                  </Link>
                </Button>
                <DeleteResourceDialog resource={resource} />
              </div>
            ) : (
              <span className="text-muted-foreground ml-auto self-center text-xs">
                다른 사람이 등록한 자료입니다
              </span>
            )}
          </div>

          {resource.body && (
            <Card>
              <CardContent className="p-6">
                <MarkdownViewer content={resource.body} />
              </CardContent>
            </Card>
          )}

          <TypeDetail resource={resource} />
        </div>

        <aside className="space-y-4">
          {toc.length >= 2 && <TableOfContents items={toc} />}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">등록자</span>
                <span>
                  {resource.author.name}
                  <span className="text-muted-foreground">
                    {" "}
                    @{resource.author.username}
                  </span>
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">등록일</span>
                <span>{resource.createdAt.slice(0, 10)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">수정일</span>
                <span>{resource.updatedAt.slice(0, 10)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">카테고리</span>
                <span>{category?.name ?? "-"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">조회</span>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Eye className="size-3.5" />
                  {resource.viewCount}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">등록 경로</span>
                <span>
                  {resource.sourceChannel === "MCP" ? "CLI (MCP)" : "웹"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">태그</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {resource.tags.map((t) => (
                <span key={t} className="bg-muted rounded px-2 py-0.5 text-xs">
                  #{t}
                </span>
              ))}
            </CardContent>
          </Card>

          {related.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">관련 자료</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {related.map((r) => (
                  <Link
                    key={r.id}
                    href={`/resources/${getContentType(r.type).slug}/${r.slug}`}
                    className="hover:bg-muted/60 -mx-2 block rounded-md px-2 py-1.5"
                  >
                    <p className="line-clamp-2 text-sm">{r.title}</p>
                    <p className="text-muted-foreground text-xs">
                      {getContentType(r.type).label}
                    </p>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
