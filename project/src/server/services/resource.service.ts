import "server-only";

import {
  PAGE_SIZE,
  type ListQuery,
  type PageSpec,
} from "@/features/resources/list.schema";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/server/auth/actor";
import * as resourceRepo from "@/server/repositories/resource.repository";
import * as audit from "@/server/services/audit.service";
import { toResource } from "@/server/services/resource.mapper";
import type { Resource } from "@/types";

/**
 * 자료 (FR-RES-001~010).
 *
 * **웹과 Ingest(`P7`)가 같은 함수를 지납니다** (`NFR-SEC-018`).
 * 그래서 요청 컨텍스트를 쓰지 않고 `Actor` 를 파라미터로 받습니다.
 */

export interface ListPage {
  items: Resource[];
  nextCursor?: string;
  total?: number;
}

/**
 * 목록.
 *
 * `viewerId` 를 받아 **북마크 여부를 한 번에 채웁니다.** 카드마다 물으면
 * 페이지당 24번의 추가 질의가 됩니다(N+1). 한 번의 `IN` 질의로 끝냅니다.
 */
export async function list(
  query: Partial<ListQuery>,
  page: PageSpec = { kind: "cursor", size: PAGE_SIZE },
  viewerId?: string
): Promise<ListPage> {
  const result = await resourceRepo.list(query, page);
  const marked = await bookmarkedIds(
    viewerId,
    result.items.map((r) => r.id)
  );

  return {
    items: result.items.map((r) =>
      toResource(r, { bookmarked: marked.has(r.id) })
    ),
    nextCursor: result.nextCursor,
    total: result.total,
  };
}

async function bookmarkedIds(
  viewerId: string | undefined,
  resourceIds: string[]
): Promise<Set<string>> {
  if (!viewerId || resourceIds.length === 0) return new Set();
  const rows = await db.bookmark.findMany({
    where: { userId: viewerId, resourceId: { in: resourceIds } },
    select: { resourceId: true },
  });
  return new Set(rows.map((b) => b.resourceId));
}

/**
 * 등록자 필터의 선택지.
 *
 * **화면이 가진 자료에서 뽑지 않습니다.** 서버 페이징 뒤에는 「현재 페이지의
 * 등록자」만 보여 필터가 거짓말을 합니다. 계정 50개 이하라(`REQ-01`)
 * 전량을 읽어도 비용이 논점이 아닙니다.
 */
export async function listAuthors(): Promise<
  { username: string; name: string }[]
> {
  return db.user.findMany({
    where: { status: "ACTIVE", resources: { some: { deletedAt: null } } },
    select: { username: true, name: true },
    orderBy: { name: "asc" },
  });
}

/**
 * 관련 자료 — 태그가 겹치는 것 (FR-RES-013).
 *
 * **자료를 전부 읽어 교집합을 세지 않습니다.** `resource_tags` 를 타고 들어가
 * DB 가 좁히게 합니다 — 1만 건에서 앞의 방식은 성립하지 않습니다.
 */
export async function findRelated(
  resourceId: string,
  tagSlugs: string[],
  limit = 3
): Promise<Resource[]> {
  if (tagSlugs.length === 0) return [];
  const rows = await db.resource.findMany({
    where: {
      id: { not: resourceId },
      deletedAt: null,
      status: "PUBLISHED",
      tags: { some: { tag: { slug: { in: tagSlugs } } } },
    },
    select: resourceRepo.RESOURCE_CARD_SELECT,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => toResource(r));
}

/** 타입별 건수 — 검색 사이드바 (`groupBy` 한 번, 타입마다 세지 않는다) */
export async function countByType(): Promise<Record<string, number>> {
  const rows = await db.resource.groupBy({
    by: ["type"],
    where: { deletedAt: null, status: "PUBLISHED" },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.type, r._count._all]));
}

/**
 * 인기 태그.
 *
 * `tags.usage_count` 를 씁니다 — 자료를 전부 읽어 집계하면 1만 건에서 무너집니다.
 * 그 컬럼은 등록·수정이 갱신하는 **표시용 캐시**입니다.
 */
export async function topTags(
  limit: number
): Promise<{ slug: string; label: string; count: number }[]> {
  const rows = await db.tag.findMany({
    where: { usageCount: { gt: 0 } },
    select: { slug: true, label: true, usageCount: true },
    orderBy: { usageCount: "desc" },
    take: limit,
  });
  return rows.map((t) => ({
    slug: t.slug,
    label: t.label,
    count: t.usageCount,
  }));
}

/** 상세 (FR-RES-007). 없으면 `NOT_FOUND` — 화면이 `notFound()` 로 바꾼다 */
export async function getBySlug(
  slug: string,
  viewerId?: string
): Promise<Resource> {
  const row = await resourceRepo.findBySlug(slug);
  if (!row) throw new AppError("NOT_FOUND", "자료를 찾을 수 없습니다.");

  const marked = await bookmarkedIds(viewerId, [row.id]);
  return toResource(row, {
    bookmarked: marked.has(row.id),
    body: row.body,
    updatedAt: row.updatedAt,
  });
}

/**
 * 조회수 (FR-RES-007).
 *
 * **상세 렌더 안에서 세지 않습니다.** 서버 컴포넌트는 프리페치·재검증으로
 * 여러 번 실행될 수 있어 숫자가 부풀고, 렌더 중 쓰기는 캐시와도 싸웁니다.
 * 화면이 «본 뒤에» 액션으로 부릅니다.
 *
 * 실패해도 조용히 지나갑니다 — 조회수 때문에 화면이 깨질 이유가 없습니다.
 */
export async function countView(resourceId: string): Promise<void> {
  try {
    await db.resource.updateMany({
      where: { id: resourceId, deletedAt: null },
      data: { viewCount: { increment: 1 } },
    });
  } catch {
    // 통계는 본 작업이 아니다
  }
}

export interface BookmarkResult {
  bookmarked: boolean;
  bookmarkCount: number;
}

/**
 * 북마크 토글 (FR-RES-009).
 *
 * **`bookmarkCount` 는 «표시용 캐시»이고 정본은 `bookmarks` 행입니다.**
 * 그래서 둘을 **같은 트랜잭션**에서 바꾸고, 카운트는 세어서 씁니다 —
 * `increment` 로 하면 두 번 누른 요청이 겹칠 때 정본과 캐시가 갈라집니다.
 */
export async function toggleBookmark(
  actor: Actor,
  resourceId: string
): Promise<BookmarkResult> {
  return db.$transaction(async (tx) => {
    const target = await tx.resource.findFirst({
      where: { id: resourceId, deletedAt: null },
      select: { id: true },
    });
    if (!target) throw new AppError("NOT_FOUND", "자료를 찾을 수 없습니다.");

    const existing = await tx.bookmark.findUnique({
      where: { userId_resourceId: { userId: actor.id, resourceId } },
      select: { userId: true },
    });

    if (existing) {
      await tx.bookmark.delete({
        where: { userId_resourceId: { userId: actor.id, resourceId } },
      });
    } else {
      await tx.bookmark.create({ data: { userId: actor.id, resourceId } });
    }

    // 정본을 세어서 캐시에 쓴다 (증감이 아니라)
    const bookmarkCount = await tx.bookmark.count({ where: { resourceId } });
    await tx.resource.update({
      where: { id: resourceId },
      data: { bookmarkCount },
    });

    return { bookmarked: !existing, bookmarkCount };
  });
}

/** 내 북마크 목록 (SCR-131) */
export async function listBookmarked(
  viewerId: string,
  page: PageSpec = { kind: "cursor", size: PAGE_SIZE }
): Promise<ListPage> {
  const marks = await db.bookmark.findMany({
    where: { userId: viewerId },
    select: { resourceId: true },
    orderBy: { createdAt: "desc" },
  });
  if (marks.length === 0) return { items: [] };

  const ids = marks.map((m) => m.resourceId);
  const rows = await db.resource.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: resourceRepo.RESOURCE_CARD_SELECT,
  });

  // 북마크한 «순서»를 유지한다 — DB 순서가 아니라
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)).filter((r) => r !== undefined);

  const start = page.kind === "offset" ? (page.page - 1) * page.size : 0;
  return {
    items: ordered
      .slice(start, start + page.size)
      .map((r) => toResource(r, { bookmarked: true })),
    total: ordered.length,
  };
}

/** 소프트 삭제 (FR-RES-010). 30일 뒤 워커가 실제로 지운다 (P6) */
export async function remove(actor: Actor, id: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const target = await tx.resource.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, title: true, authorId: true },
    });
    if (!target) throw new AppError("NOT_FOUND", "자료를 찾을 수 없습니다.");

    // 소유권 판정은 service 에서 (actor.ts)
    if (actor.role === "MEMBER" && target.authorId !== actor.id) {
      throw new AppError("FORBIDDEN", "이 자료를 삭제할 권한이 없습니다.");
    }

    await tx.resource.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await audit.log(
      actor,
      {
        action: "RESOURCE_DELETE",
        targetType: "resource",
        targetId: id,
        summary: `자료 삭제 — ${target.title}`,
      },
      tx
    );
  });
}
