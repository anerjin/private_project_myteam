import { Bookmark, Eye, FolderPlus, Pencil, Share2 } from "lucide-react";
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
import { resources } from "@/mocks";

export async function generateMetadata({
  params,
}: PageProps<"/resources/[type]/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const r = resources.find((x) => x.slug === slug);
  return { title: r?.title ?? "자료" };
}

/** SCR-112 자료 상세 */
export default async function ResourceDetailPage({
  params,
}: PageProps<"/resources/[type]/[slug]">) {
  const { type, slug } = await params;
  const meta = getContentTypeBySlug(type);
  const resource = resources.find(
    (r) => r.slug === slug && r.type === meta?.code
  );
  if (!meta || !resource) notFound();
  const category = CATEGORIES.find((c) => c.slug === resource.category);
  const toc = resource.body ? extractToc(resource.body) : [];

  const session = await requireActiveUser();
  // 목 자료의 author.id 는 실제 계정 id 와 맞지 않아 P2~P3 동안 EDITOR+ 에게만 보인다.
  // **버그가 아니라 목 경계가 드러난 것이므로 목 데이터를 맞추지 않는다** — P4 에서 저절로 맞는다.
  const canEdit = canEditResource(await toActor(session), resource.author.id);
  const related = resources
    .filter(
      (r) =>
        r.id !== resource.id && r.tags.some((t) => resource.tags.includes(t))
    )
    .slice(0, 3);

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
            <Button variant="outline" size="sm">
              <Bookmark
                className={
                  resource.bookmarked
                    ? "size-4 fill-amber-400 text-amber-500"
                    : "size-4"
                }
              />
              북마크
            </Button>
            <Button variant="outline" size="sm">
              <FolderPlus className="size-4" />
              컬렉션에 담기
            </Button>
            <Button variant="outline" size="sm">
              <Share2 className="size-4" />
              링크 복사
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
