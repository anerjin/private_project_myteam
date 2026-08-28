import { GripVertical, Lock, Pencil, Plus, Users, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TypeBadge } from "@/features/resources/components/badges";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireActiveUser } from "@/server/auth/guards";
import { collections, resources } from "@/mocks";
import { getContentType } from "@/features/resources/content-types";

export async function generateStaticParams() {
  return collections.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/collections/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: collections.find((c) => c.slug === slug)?.name ?? "컬렉션" };
}

/** SCR-132 컬렉션 상세 */
export default async function CollectionDetailPage({
  params,
}: PageProps<"/collections/[slug]">) {
  const { slug } = await params;
  const collection = collections.find((c) => c.slug === slug);
  if (!collection) notFound();

  // 목 데이터: 컬렉션에 담긴 자료를 임의로 골라 보여준다
  const items = resources.slice(0, collection.itemCount).map((r, i) => ({
    resource: r,
    note:
      i === 0
        ? "먼저 이것부터 읽으세요. 나머지 자료의 전제가 됩니다."
        : i === 2
          ? "설정 예시만 참고하면 됩니다."
          : undefined,
  }));

  const session = await requireActiveUser();
  const isOwner =
    collection.owner.id === session.userId || session.role !== "MEMBER";

  return (
    <>
      <PageHeader
        description={collection.description}
        count={items.length}
        action={
          isOwner ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <Pencil className="size-4" />
                편집
              </Button>
              <Button size="sm">
                <Plus className="size-4" />
                자료 담기
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-sm">
        <span className="inline-flex items-center gap-1.5">
          {collection.visibility === "TEAM" ? (
            <>
              <Users className="size-3.5" /> 팀 공개
            </>
          ) : (
            <>
              <Lock className="size-3.5" /> 비공개
            </>
          )}
        </span>
        <span>만든 사람 {collection.owner.name}</span>
        <span>마지막 수정 {collection.updatedAt.slice(0, 10)}</span>
      </div>

      <div className="space-y-3">
        {items.map(({ resource, note }, i) => (
          <Card key={resource.id}>
            <CardContent className="flex items-start gap-4 p-4">
              {isOwner && (
                <GripVertical className="text-muted-foreground mt-1 size-4 shrink-0 cursor-grab" />
              )}
              <span className="text-muted-foreground mt-0.5 w-5 shrink-0 text-sm tabular-nums">
                {i + 1}
              </span>

              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <TypeBadge type={resource.type} />
                  <Link
                    href={`/resources/${getContentType(resource.type).slug}/${resource.slug}`}
                    className="hover:text-primary font-medium"
                  >
                    {resource.title}
                  </Link>
                </div>
                {resource.summary && (
                  <p className="text-muted-foreground line-clamp-1 text-sm">
                    {resource.summary}
                  </p>
                )}
                {note && (
                  <p className="border-primary/40 text-muted-foreground border-l-2 pl-2 text-xs">
                    {note}
                  </p>
                )}
              </div>

              {isOwner && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="컬렉션에서 빼기"
                >
                  <X className="size-4" />
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
