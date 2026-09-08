import { Lock, Users } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { CollectionItems } from "@/features/collections/components/collection-items";
import { EditCollectionButtons } from "@/features/collections/components/collection-form";
import { getContentType } from "@/features/resources/content-types";
import { AppError } from "@/lib/errors";
import { decodeSegment } from "@/lib/route-params";
import { requireActiveUser } from "@/server/auth/guards";
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
 * ## 「고칠 수 있는가」가 없어졌습니다 (`DEC-077`)
 *
 * 🔄 「본인 + `EDITOR` 이상」이었고 그 값을 `CollectionItems` 에 넘겼습니다.
 *    등급이 사라져 판정이 통째로 참이 됐습니다 — 읽기 판정(`collection.service`)과
 *    **같은 규칙**이라는 점은 그대로이고, 그쪽도 함께 접혔습니다.
 */
export default async function CollectionDetailPage({
  params,
}: PageProps<"/collections/[slug]">) {
  // 반환값은 안 씁니다 — 「들어와도 되는가」만 묻습니다 (`DEC-035`)
  await requireActiveUser();
  const { slug: rawSlug } = await params;
  const slug = decodeSegment(rawSlug);

  let data;
  try {
    data = await collectionService.getBySlug(slug);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { collection, items } = data;

  return (
    <>
      <PageHeader
        description={collection.description}
        count={items.length}
        action={
          <EditCollectionButtons
            collection={{
              slug: collection.slug,
              name: collection.name,
              description: collection.description,
              visibility: collection.visibility,
            }}
          />
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
