import "server-only";

import { db } from "@/lib/db";
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
 */
export async function listFor(viewerId: string): Promise<{
  team: Collection[];
  mine: Collection[];
}> {
  const [team, mine] = await Promise.all([
    db.collection.findMany({
      where: { visibility: "TEAM", deletedAt: null },
      select: COLLECTION_SELECT,
      orderBy: { updatedAt: "desc" },
    }),
    db.collection.findMany({
      where: { ownerId: viewerId, deletedAt: null },
      select: COLLECTION_SELECT,
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  return { team: team.map(toCollection), mine: mine.map(toCollection) };
}

/** 상세 — 담긴 자료를 순서대로 */
export async function getBySlug(
  slug: string,
  viewerId: string
): Promise<{ collection: Collection; items: Resource[] }> {
  const row = await db.collection.findFirst({
    where: { slug, deletedAt: null },
    select: COLLECTION_SELECT,
  });
  if (!row) throw new AppError("NOT_FOUND", "컬렉션을 찾을 수 없습니다.");

  // 비공개는 소유자만 — service 에서 판정한다 (데이터를 봐야 알 수 있으므로)
  if (row.visibility === "PRIVATE" && row.owner.id !== viewerId) {
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
