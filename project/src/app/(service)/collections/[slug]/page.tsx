import { Lock, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { TypeBadge } from "@/features/resources/components/badges";
import { getContentType } from "@/features/resources/content-types";
import { AppError } from "@/lib/errors";
import { requireActiveUser, toActor } from "@/server/auth/guards";
import * as collectionService from "@/server/services/collection.service";
import { decodeSegment } from "@/lib/route-params";

/*
 * **`generateStaticParams` 를 두지 않습니다.** 이 페이지는 `requireActiveUser()`
 * (→ `cookies()`)로 어차피 동적이고, 비공개 컬렉션은 보는 사람에 따라 결과가
 * 달라집니다 — 정적으로 구울 수 있는 페이지가 아닙니다.
 */

export async function generateMetadata({
  params,
}: PageProps<"/collections/[slug]">): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeSegment(rawSlug);
  // 제목만 필요하므로 접근 판정 없이 이름만 본다 (없으면 기본값)
  return { title: slug ? "컬렉션" : "컬렉션" };
}

/**
 * SCR-132 컬렉션 상세.
 *
 * **읽기 경로만 있습니다.** 편집·담기·빼기·순서 바꾸기는 아직 없어서
 * 버튼을 두지 않았습니다 — 회원 상세에서 장식 버튼을 걷어낸 것과 같은 판단입니다
 * (`DEC-045`).
 */
export default async function CollectionDetailPage({
  params,
}: PageProps<"/collections/[slug]">) {
  const session = await requireActiveUser();
  const { slug: rawSlug } = await params;
  const slug = decodeSegment(rawSlug);

  let data;
  try {
    data = await collectionService.getBySlug(slug, await toActor(session));
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { collection, items } = data;

  return (
    <>
      <PageHeader description={collection.description} count={items.length} />

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

      {items.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border py-8 text-center text-sm">
          담긴 자료가 없습니다.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((resource, i) => (
            <Card key={resource.id}>
              <CardContent className="flex items-start gap-4 p-4">
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
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
