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

/** 빵부스러기 라벨용 이름 한 개 — `resource.service.titleBySlug` 와 같은 자리·같은 이유 */
export async function nameBySlug(slug: string): Promise<string | null> {
  const c = await db.collection.findUnique({
    where: { slug },
    select: { name: true },
  });
  return c?.name ?? null;
}

/* ────────────────────────────────────────────────────────────────────────
 * 쓰기 (`FR-COLL-003`~`006`)
 *
 * ## 소유권은 **본인 + `EDITOR` 이상** (`REQ-02 · 2.5`)
 *
 * 읽기 쪽(`listFor`·`getBySlug`)이 이미 그 규칙으로 판정하고 있습니다.
 * 쓰기만 「본인만」으로 좁히면 **관리자가 편집해야 할 컬렉션을 볼 수는 있는데
 * 고칠 수는 없는** 상태가 됩니다 — 목록과 상세가 서로 다른 규칙을 쓰던
 * `P4` 이전 상태와 같은 부류의 어긋남입니다.
 * ──────────────────────────────────────────────────────────────────────── */

/** 이 컬렉션을 고칠 수 있는가 — 읽기 판정과 **같은 규칙** */
function assertCanEdit(actor: Actor, ownerId: string): void {
  if (ownerId !== actor.id && !isEditor(actor)) {
    throw new AppError("FORBIDDEN", "이 컬렉션을 편집할 권한이 없습니다.");
  }
}

/**
 * 이름 → slug.
 *
 * **한글을 버리지 않습니다** — `resource.write.toSlug` 와 같은 판단입니다.
 * 라틴 문자만 남기면 「AI 온보딩」이 `ai` 가 되고, 팀이 한국어로 이름을
 * 붙이므로 대부분이 그렇게 뭉개집니다.
 */
function toSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, " ")
    .trim()
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug.length >= 2
    ? slug
    : `collection-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 컬렉션 생성 (`FR-COLL-003`).
 *
 * `visibility` 가 `TEAM` 이면 **팀 전체가 봅니다** (`FR-COLL-006`) —
 * 온보딩 자료 묶음이 그 용도입니다.
 */
export async function create(
  actor: Actor,
  input: { name: string; description?: string; visibility: "PRIVATE" | "TEAM" }
): Promise<{ slug: string }> {
  const base = toSlug(input.name);

  /*
   * **유니크 위반을 재시도합니다.** 같은 이름을 동시에 만들면 미커밋 행이
   * 안 보여 둘 다 「비어 있다」고 판정합니다 — `resource.write.create` 가
   * 겪은 그대로이고, 최종 방어선은 DB 제약입니다.
   */
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    try {
      const created = await db.collection.create({
        data: {
          name: input.name,
          slug,
          description: input.description,
          visibility: input.visibility,
          ownerId: actor.id,
        },
        select: { slug: true },
      });
      return created;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== "P2002" || attempt === 2) throw e;
    }
  }
  throw new AppError(
    "DUPLICATE",
    "같은 이름의 컬렉션이 이미 있습니다. 이름을 조금 바꿔 주세요."
  );
}

/** 이름·설명·공개범위 수정 (`FR-COLL-003`·`006`) */
export async function update(
  actor: Actor,
  slug: string,
  input: {
    name?: string;
    description?: string | null;
    visibility?: "PRIVATE" | "TEAM";
  }
): Promise<void> {
  const target = await db.collection.findFirst({
    where: { slug, deletedAt: null },
    select: { id: true, ownerId: true },
  });
  if (!target) throw new AppError("NOT_FOUND", "컬렉션을 찾을 수 없습니다.");
  assertCanEdit(actor, target.ownerId);

  await db.collection.update({
    where: { id: target.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.visibility !== undefined
        ? { visibility: input.visibility }
        : {}),
    },
  });
}

/** 삭제 — **소프트 삭제**입니다. `deletedAt` 이 있고 읽기 쪽이 이미 봅니다 */
export async function remove(actor: Actor, slug: string): Promise<void> {
  const target = await db.collection.findFirst({
    where: { slug, deletedAt: null },
    select: { id: true, ownerId: true },
  });
  if (!target) throw new AppError("NOT_FOUND", "컬렉션을 찾을 수 없습니다.");
  assertCanEdit(actor, target.ownerId);

  await db.collection.update({
    where: { id: target.id },
    data: { deletedAt: new Date() },
  });
}

/**
 * 자료 담기 (`FR-COLL-004`).
 *
 * **이미 담긴 것을 다시 담아도 오류가 아닙니다.** 카드의 「담기」를 두 번
 * 누르는 것은 실수가 아니라 확인이고, 「이미 있습니다」는 사용자가 할 일이
 * 없는 문구입니다. 그래서 `upsert` 로 조용히 넘어갑니다.
 */
export async function addItem(
  actor: Actor,
  slug: string,
  resourceId: string,
  note?: string
): Promise<{ added: boolean }> {
  const target = await db.collection.findFirst({
    where: { slug, deletedAt: null },
    select: { id: true, ownerId: true },
  });
  if (!target) throw new AppError("NOT_FOUND", "컬렉션을 찾을 수 없습니다.");
  assertCanEdit(actor, target.ownerId);

  const resource = await db.resource.findFirst({
    where: { id: resourceId, deletedAt: null },
    select: { id: true },
  });
  if (!resource) throw new AppError("NOT_FOUND", "자료를 찾을 수 없습니다.");

  const existing = await db.collectionItem.findUnique({
    where: {
      collectionId_resourceId: { collectionId: target.id, resourceId },
    },
    select: { resourceId: true },
  });
  if (existing) return { added: false };

  // 새 항목은 **맨 뒤**로 — 기존 순서를 흔들지 않습니다
  const last = await db.collectionItem.aggregate({
    where: { collectionId: target.id },
    _max: { sortOrder: true },
  });

  await db.collectionItem.create({
    data: {
      collectionId: target.id,
      resourceId,
      note,
      sortOrder: (last._max.sortOrder ?? 0) + 10,
    },
  });
  // `updatedAt` 은 컬렉션 행이 안 바뀌면 안 움직입니다 — 목록 정렬이 이 값을 봅니다
  await db.collection.update({
    where: { id: target.id },
    data: { updatedAt: new Date() },
  });
  return { added: true };
}

/** 자료 빼기 (`FR-COLL-004`) */
export async function removeItem(
  actor: Actor,
  slug: string,
  resourceId: string
): Promise<void> {
  const target = await db.collection.findFirst({
    where: { slug, deletedAt: null },
    select: { id: true, ownerId: true },
  });
  if (!target) throw new AppError("NOT_FOUND", "컬렉션을 찾을 수 없습니다.");
  assertCanEdit(actor, target.ownerId);

  await db.collectionItem.deleteMany({
    where: { collectionId: target.id, resourceId },
  });
  await db.collection.update({
    where: { id: target.id },
    data: { updatedAt: new Date() },
  });
}

/**
 * 순서 변경 (`FR-COLL-005`) — **목록 전체**를 받습니다.
 *
 * 「이것을 위로」 식으로 하나만 받으면 두 사람이 동시에 움직였을 때 순서가
 * 뒤엉킵니다 (`category.service.reorder` 와 같은 판단).
 *
 * 규격은 드래그를 말하지만 **입력 방식과 무관한 계약**입니다 — 화면이
 * 드래그든 버튼이든 여기로는 「이 순서로 해 주세요」가 옵니다.
 */
export async function reorderItems(
  actor: Actor,
  slug: string,
  resourceIds: string[]
): Promise<void> {
  const target = await db.collection.findFirst({
    where: { slug, deletedAt: null },
    select: { id: true, ownerId: true },
  });
  if (!target) throw new AppError("NOT_FOUND", "컬렉션을 찾을 수 없습니다.");
  assertCanEdit(actor, target.ownerId);

  await db.$transaction(async (tx) => {
    const items = await tx.collectionItem.findMany({
      where: { collectionId: target.id },
      select: { resourceId: true },
    });
    const known = new Set(items.map((i) => i.resourceId));
    /*
     * **목록에 없는 것이 오면 거절합니다.** 조용히 무시하면 화면이 보내온
     * 순서와 저장된 순서가 달라지고, 다음 새로고침에서 사용자가 그 차이를
     * 봅니다 — 이유 없이 되돌아간 것처럼 보입니다.
     */
    for (const id of resourceIds) {
      if (!known.has(id)) {
        throw new AppError(
          "INVALID_STATE",
          "목록이 바뀌었습니다. 새로고침한 뒤 다시 시도해 주세요."
        );
      }
    }

    for (const [i, resourceId] of resourceIds.entries()) {
      await tx.collectionItem.update({
        where: {
          collectionId_resourceId: { collectionId: target.id, resourceId },
        },
        data: { sortOrder: (i + 1) * 10 },
      });
    }
    await tx.collection.update({
      where: { id: target.id },
      data: { updatedAt: new Date() },
    });
  });
}

/**
 * 「담기」 버튼이 보여줄 목록 — **내가 담을 수 있는 컬렉션**과 이미 담겼는지.
 *
 * 자료 상세에서 한 번에 묻습니다. 컬렉션마다 물으면 질의가 개수만큼 늘고,
 * 그 화면은 이미 상세·관련자료·첨부를 함께 그립니다.
 */
export async function listForPicker(
  actor: Actor,
  resourceId: string
): Promise<{ slug: string; name: string; contains: boolean }[]> {
  const rows = await db.collection.findMany({
    where: isEditor(actor)
      ? { deletedAt: null }
      : { deletedAt: null, ownerId: actor.id },
    select: {
      slug: true,
      name: true,
      items: { where: { resourceId }, select: { resourceId: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((c) => ({
    slug: c.slug,
    name: c.name,
    contains: c.items.length > 0,
  }));
}
