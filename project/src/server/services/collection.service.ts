import "server-only";

import { db } from "@/lib/db";
import { isEditor, type Actor } from "@/server/auth/actor";
import { AppError } from "@/lib/errors";
import type { Collection, Resource } from "@/types";
import { toResource } from "@/server/services/resource.mapper";
import { RESOURCE_CARD_SELECT } from "@/server/repositories/resource.repository";

/**
 * 컬렉션 (FR-COLL-003~006).
 *
 * **읽기 경로만 있습니다.** 만들기·담기·정렬은 그 기능의 페이즈 몫입니다 —
 * `P4` 작업표에 컬렉션 «생성»은 없고, `Collection` 테이블은 이미 있으므로
 * 목을 걷어내는 데 필요한 것은 조회뿐입니다.
 * 화면의 「컬렉션 만들기」는 `disabled` 로 두었습니다 — 「있는데 안 된다」보다
 * 「아직 없다」가 정직합니다 (`DEC-045`).
 */

const COLLECTION_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  visibility: true,
  updatedAt: true,
  owner: { select: { id: true, username: true, name: true, department: true } },
  _count: { select: { items: true } },
} as const;

type Row = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: "PRIVATE" | "TEAM";
  updatedAt: Date;
  owner: {
    id: string;
    username: string;
    name: string;
    department: string | null;
  };
  _count: { items: number };
};

function toCollection(c: Row): Collection {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description ?? undefined,
    visibility: c.visibility,
    owner: {
      id: c.owner.id,
      username: c.owner.username,
      name: c.owner.name,
      department: c.owner.department ?? "",
    },
    itemCount: c._count.items,
    updatedAt: c.updatedAt.toISOString(),
  };
}

/**
 * 목록 — 팀 공개 + 내 것.
 *
 * **`PRIVATE` 은 소유자에게만 보입니다.** 이 판정을 화면이 하면 다른 사람의
 * 비공개 컬렉션이 RSC 페이로드에 실려 나갑니다 — 안 그려도 payload 에는 있습니다.
 *
 * > **`EDITOR`·`ADMIN` 은 전부 봅니다** (`REQ-02 · 2.5` 권한 매트릭스:
 * > 「컬렉션 생성·편집 — MEMBER ⚠️본인 / **EDITOR ✅전체 / ADMIN ✅전체**」).
 * > 전에는 `viewerId` 만 받아 역할을 몰랐고, 그래서 **관리자가 편집해야 할 컬렉션을
 * > 볼 수조차 없었습니다.** 목록과 상세가 서로 일관됐을 뿐 둘 다 규격과 어긋났습니다.
 */
export async function listFor(actor: Actor): Promise<{
  team: Collection[];
  mine: Collection[];
}> {
  const [team, mine] = await Promise.all([
    db.collection.findMany({
      // 편집자·관리자에게는 비공개도 「팀」 목록에 함께 보인다
      where: isEditor(actor)
        ? { deletedAt: null, NOT: { ownerId: actor.id } }
        : { visibility: "TEAM", deletedAt: null },
      select: COLLECTION_SELECT,
      orderBy: { updatedAt: "desc" },
    }),
    db.collection.findMany({
      where: { ownerId: actor.id, deletedAt: null },
      select: COLLECTION_SELECT,
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  return { team: team.map(toCollection), mine: mine.map(toCollection) };
}

/** 상세 — 담긴 자료를 순서대로 */
export async function getBySlug(
  slug: string,
  actor: Actor
): Promise<{ collection: Collection; items: Resource[] }> {
  const row = await db.collection.findFirst({
    where: { slug, deletedAt: null },
    select: COLLECTION_SELECT,
  });
  if (!row) throw new AppError("NOT_FOUND", "컬렉션을 찾을 수 없습니다.");

  /*
   * 비공개는 소유자와 `EDITOR` 이상만 — service 에서 판정합니다
   * (데이터를 봐야 알 수 있으므로, `actor.ts`).
   *
   * **`FORBIDDEN` 이 아니라 `NOT_FOUND` 로 위장합니다.** 「권한이 없습니다」는
   * *그 slug 의 컬렉션이 존재한다*를 알려 줍니다 — 남의 비공개 컬렉션의
   * 존재 여부를 slug 로 캐낼 수 있게 됩니다.
   */
  if (
    row.visibility === "PRIVATE" &&
    row.owner.id !== actor.id &&
    !isEditor(actor)
  ) {
    throw new AppError("NOT_FOUND", "컬렉션을 찾을 수 없습니다.");
  }

  const items = await db.collectionItem.findMany({
    where: { collectionId: row.id, resource: { deletedAt: null } },
    select: { resource: { select: RESOURCE_CARD_SELECT } },
    orderBy: { sortOrder: "asc" },
  });

  return {
    collection: toCollection(row),
    items: items.map((i) => toResource(i.resource)),
  };
}
