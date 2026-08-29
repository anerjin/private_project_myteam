import { Lock, Users } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { CollectionItems } from "@/features/collections/components/collection-items";
import { EditCollectionButtons } from "@/features/collections/components/collection-form";
import { getContentType } from "@/features/resources/content-types";
import { AppError } from "@/lib/errors";
import { decodeSegment } from "@/lib/route-params";
import { requireActiveUser, toActor } from "@/server/auth/guards";
import * as collectionService from "@/server/services/collection.service";

/*
 * **`generateStaticParams` 를 두지 않습니다.** 이 페이지는 `requireActiveUser()`
 * (→ `cookies()`)로 어차피 동적이고, 비공개 컬렉션은 보는 사람에 따라 결과가
 * 달라집니다 — 정적으로 구울 수 있는 페이지가 아닙니다.
 */

export async function generateMetadata({
  params,
}: PageProps<"/collections/[slug]">): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const name = await collectionService.nameBySlug(decodeSegment(rawSlug));
  return { title: name ? `${name} · 컬렉션` : "컬렉션" };
}

/**
 * SCR-132 컬렉션 상세 (`FR-COLL-004`·`005`·`006`).
 *
 * ## 편집 버튼은 **배선과 함께** 왔습니다
 *
 * 여기에는 읽기 경로만 있었습니다 — 담기·빼기·순서가 없어서 버튼도 두지
 * 않았고, 그게 그때는 정직했습니다 (`DEC-045`).
 *
 * ## 「고칠 수 있는가」는 **서버가** 판정합니다
 *
 * 본인 + `EDITOR` 이상입니다 (`REQ-02 · 2.5`). 읽기 판정과 같은 규칙이고,
 * 화면은 그 결과를 받아 버튼을 그릴지만 정합니다 — 실제 차단은 액션이
 * 지나는 service 가 다시 합니다.
 */
export default async function CollectionDetailPage({
  params,
}: PageProps<"/collections/[slug]">) {
  const session = await requireActiveUser();
  const { slug: rawSlug } = await params;
  const slug = decodeSegment(rawSlug);
  const actor = await toActor(session);

  let data;
  try {
    data = await collectionService.getBySlug(slug, actor);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { collection, items } = data;

  // 읽기 판정과 **같은 규칙** — 본인 또는 `EDITOR` 이상
  const canEdit =
    collection.owner.id === session.userId ||
    session.role === "EDITOR" ||
    session.role === "ADMIN";

  return (
    <>
      <PageHeader
        description={collection.description}
        count={items.length}
        action={
          canEdit ? (
            <EditCollectionButtons
              collection={{
                slug: collection.slug,
                name: collection.name,
                description: collection.description,
                visibility: collection.visibility,
              }}
            />
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

      <CollectionItems
        slug={collection.slug}
        canEdit={canEdit}
        items={items.map((r) => {
          /*
           * 주소 세그먼트·라벨·색은 **레지스트리가 압니다.** 클라이언트가
           * 그것을 import 하면 `features/collections → features/resources` 가
           * 되어 `check-deps` 가 막습니다 — 여기서 꺼내 문자열로 넘깁니다.
           */
          const meta = getContentType(r.type);
          return {
            id: r.id,
            slug: r.slug,
            typeSlug: meta.slug,
            typeLabel: meta.label,
            badgeClass: meta.badgeClass,
            title: r.title,
            summary: r.summary,
          };
        })}
      />
    </>
  );
}