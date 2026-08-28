import "server-only";

import {
  PAGE_SIZE,
  type ListQuery,
  type PageSpec,
} from "@/features/resources/list.schema";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { redis } from "@/lib/redis";
import type { Actor } from "@/server/auth/actor";
import * as resourceRepo from "@/server/repositories/resource.repository";
import * as audit from "@/server/services/audit.service";
import { toResource } from "@/server/services/resource.mapper";
import type { Resource } from "@/types";

/**
 * 자료 조회·북마크·조회수·삭제 (`FR-RES-001`·`003`·`007`·`014`, `FR-COLL-001`·`002`).
 *
 * **웹과 Ingest(`P7`)가 같은 함수를 지납니다** (`NFR-SEC-018`).
 * 그래서 요청 컨텍스트를 쓰지 않고 `Actor` 를 파라미터로 받습니다.
 */

export interface ListPage {
  items: Resource[];
  nextCursor?: string;
  total?: number;
  /**
   * 검색 후보가 상한(`DEC-048`)에 닿았는가.
   * **없는 것과 안 보여주는 것을 사용자가 구별할 수 있어야 합니다.**
   */
  searchTruncated?: boolean;
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
  viewerId?: string,
  /** 관리 화면의 휴지통 탭. 되살리기 자체는 아직 없다 — `P8` */
  scope: "live" | "trash" = "live"
): Promise<ListPage> {
  const result = await resourceRepo.list(query, page, scope);
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
    searchTruncated: result.searchTruncated,
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
 * 관련 자료 — 태그가 겹치는 것. 상세 화면의 일부다 (`FR-RES-003`).
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

/** 대시보드 숫자 — **한 객체로 묶되 전부 «지금 있는» 값입니다** (없는 값에 `0` 을 넣지 않음) */
export async function myCounts(viewerId: string): Promise<{
  total: number;
  weeklyNew: number;
  myBookmarks: number;
  myResources: number;
}> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const live = { deletedAt: null, status: "PUBLISHED" as const };

  const [total, weeklyNew, myBookmarks, myResources] = await Promise.all([
    db.resource.count({ where: live }),
    db.resource.count({ where: { ...live, createdAt: { gte: weekAgo } } }),
    db.bookmark.count({ where: { userId: viewerId } }),
    db.resource.count({ where: { ...live, authorId: viewerId } }),
  ]);
  return { total, weeklyNew, myBookmarks, myResources };
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

/** 카테고리별 건수 — 분류 관리 화면 */
export async function countByCategory(): Promise<Record<string, number>> {
  const rows = await db.category.findMany({
    select: {
      slug: true,
      _count: {
        select: {
          resources: { where: { deletedAt: null, status: "PUBLISHED" } },
        },
      },
    },
  });
  return Object.fromEntries(rows.map((c) => [c.slug, c._count.resources]));
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

/**
 * 상세 (`FR-RES-003`). 없으면 `NOT_FOUND` — 화면이 `notFound()` 로 바꾼다.
 *
 * **초안은 작성자와 `EDITOR` 이상만 봅니다.** 전에는 `status` 를 아예 안 봐서
 * 목록에는 안 나오는 초안이 **URL 로는 열렸습니다.** 지금은 등록 경로가 없어
 * 잠복 상태지만, 폼의 「임시 저장」을 붙이는 순간 ① 작성자가 자기 초안을 목록에서
 * 못 보고 ② 남이 URL 로 읽고 ③ 화면은 「게시됨」이라고 말하게 됩니다.
 *
 * 못 보는 경우 `FORBIDDEN` 이 아니라 **`NOT_FOUND`** 입니다 — 「권한이 없습니다」는
 * *그 slug 의 자료가 존재한다*를 알려 줍니다.
 */
export async function getBySlug(
  slug: string,
  viewerId?: string,
  viewerRole?: Actor["role"]
): Promise<Resource> {
  const row = await resourceRepo.findBySlug(slug);
  if (!row) throw new AppError("NOT_FOUND", "자료를 찾을 수 없습니다.");

  if (row.status !== "PUBLISHED") {
    const isAuthor = viewerId !== undefined && row.author.id === viewerId;
    const canSeeDrafts =
      isAuthor || viewerRole === "EDITOR" || viewerRole === "ADMIN";
    if (!canSeeDrafts) {
      throw new AppError("NOT_FOUND", "자료를 찾을 수 없습니다.");
    }
  }

  const marked = await bookmarkedIds(viewerId, [row.id]);
  return toResource(row, {
    bookmarked: marked.has(row.id),
    body: row.body,
    updatedAt: row.updatedAt,
  });
}

/**
 * 같은 사람의 같은 자료 조회를 한 번으로 치는 창 (`FR-RES-014`).
 *
 * 6시간입니다. 오전에 세 번 열어 본 것은 **한 번 본 것**이고, 다음 날 다시 읽는
 * 것은 **새로 본 것**입니다. 값이 너무 짧으면(예: 5분) 새로고침 몇 번에 숫자가
 * 부풀고, 너무 길면(예: 일주일) 「많이 본 순」이 며칠 전 순위에 얼어붙습니다.
 */
const VIEW_DEDUPE_TTL_SEC = 6 * 60 * 60;

/**
 * 조회수 — 상세 진입 시 세고 **동일 사용자는 중복 제외**한다 (`FR-RES-014`).
 *
 * **상세 렌더 안에서 세지 않습니다.** 서버 컴포넌트는 프리페치·재검증으로
 * 여러 번 실행될 수 있어 숫자가 부풀고, 렌더 중 쓰기는 캐시와도 싸웁니다.
 * 화면이 «본 뒤에» 액션으로 부릅니다.
 *
 * ## 중복 제외가 「많이 본 순」을 의미 있게 만듭니다
 *
 * 없으면 `viewCount` 는 **새로고침 횟수**입니다 — 자기 자료를 자주 열어 보는
 * 사람의 글이 위로 올라가고, 정렬 축 하나가 통째로 거짓말이 됩니다.
 * `FR-RES-014` 가 P0 인 이유이고, DoD 5항목이 이것을 묻지 않아 빠져 있었습니다.
 *
 * `SET NX EX` **한 번**으로 판정합니다. 「읽고 없으면 쓴다」로 하면 같은 사람의
 * 동시 요청 둘이 모두 통과해 두 번 세어집니다 — 북마크 카운터에서 겪은
 * lost update 와 같은 형태입니다.
 *
 * ## Redis 가 죽으면 **셉니다**
 *
 * 중복 제외는 정확도를 높이는 장치이지 조회수의 전제가 아닙니다.
 * 못 세는 쪽(통계가 사라짐)보다 더 세는 쪽(잠깐 부풀음)이 낫고,
 * `NFR-AVAIL-004`(Redis 장애를 서비스 장애로 만들지 않는다)와도 같은 방향입니다 —
 * 세션의 `touch()` 가 DB 오류에 `true` 를 돌려주는 것과 같은 판단입니다.
 *
 * 실패해도 조용히 지나갑니다 — 조회수 때문에 화면이 깨질 이유가 없습니다.
 */
export async function countView(
  resourceId: string,
  viewerId: string
): Promise<void> {
  try {
    const first = await redis
      .set(
        `view:${viewerId}:${resourceId}`,
        "1",
        "EX",
        VIEW_DEDUPE_TTL_SEC,
        "NX"
      )
      .catch(() => "OK" as const);
    if (first !== "OK") return;

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
 * 북마크 토글 (`FR-COLL-001`).
 *
 * **`bookmarkCount` 는 «표시용 캐시»이고 정본은 `bookmarks` 행입니다.**
 *
 * > **전에는 「세어서 쓴다」였고 주석이 *"`increment` 로 하면 정본과 캐시가
 * > 갈라집니다"* 라고 근거를 댔습니다 — 정확히 반대였습니다.**
 * > `count()` → `update()` 는 READ COMMITTED 에서 교과서적 lost update 이고,
 * > **5명이 동시에 누르면 캐시가 3, 정본이 5로 어긋나는 것을 실측**했습니다.
 * > `increment` 는 SQL `SET x = x + 1` 이라 **원자적**입니다.
 * >
 * > `DEC-036`(advisory 락)·`DEC-043`(트랜잭션)을 세워 놓고 같은 종류의 경합을
 * > 카운터에서 놓쳤고, 근거를 거꾸로 적어 둬서 **고치려는 사람을 되돌릴 뻔했습니다.**
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

    /*
     * **행을 먼저 «조건부로» 바꾸고, 그 결과로 카운터를 움직입니다.**
     * `count` 가 0/1 이므로 두 요청이 겹쳐도 한쪽만 카운터를 건드립니다 —
     * 「이미 북마크한 자료를 두 번 누름」이 캐시를 두 번 올리지 않습니다.
     */
    let delta = 0;
    if (existing) {
      const { count } = await tx.bookmark.deleteMany({
        where: { userId: actor.id, resourceId },
      });
      delta = -count;
    } else {
      // `createMany` + `skipDuplicates` 로 경합에서 유니크 위반 대신 0건을 받는다
      const { count } = await tx.bookmark.createMany({
        data: [{ userId: actor.id, resourceId }],
        skipDuplicates: true,
      });
      delta = count;
    }

    const updated =
      delta === 0
        ? await tx.resource.findUniqueOrThrow({
            where: { id: resourceId },
            select: { bookmarkCount: true },
          })
        : await tx.resource.update({
            where: { id: resourceId },
            // 원자적 증감 — 세어서 쓰면 lost update 가 난다
            data: { bookmarkCount: { increment: delta } },
            select: { bookmarkCount: true },
          });

    return { bookmarked: !existing, bookmarkCount: updated.bookmarkCount };
  });
}

/**
 * 내 북마크 목록 (SCR-133, `FR-COLL-002`).
 *
 * > **전에는 북마크 «전량»을 읽고 JS 에서 잘랐습니다.** 24건을 보여주려고 N건을
 * > 읽었고(타입 상세 6개 LEFT JOIN 포함) `IN` 목록에 상한도 없었습니다 —
 * > 1만 건 목록을 위해 커서를 도입하고 「전체를 RSC 페이로드로 보내면 성립하지
 * > 않는다」고 적어 놓고 **여기서 그 짓을 하고 있었습니다.**
 * > `status` 도 여기만 안 봐서 초안이 섞일 수 있었습니다.
 *
 * `bookmark` 를 **기준 테이블로 뒤집어** DB 가 자르게 합니다.
 * 「북마크한 순서 유지」도 `orderBy` 가 합니다.
 */
export async function listBookmarked(
  viewerId: string,
  page: PageSpec = { kind: "cursor", size: PAGE_SIZE }
): Promise<ListPage> {
  const where = {
    userId: viewerId,
    resource: { deletedAt: null, status: "PUBLISHED" as const },
  };
  const include = { resource: { select: resourceRepo.RESOURCE_CARD_SELECT } };
  const orderBy = [
    { createdAt: "desc" as const },
    { resourceId: "desc" as const },
  ];

  if (page.kind === "offset") {
    const [rows, total] = await Promise.all([
      db.bookmark.findMany({
        where,
        include,
        orderBy,
        skip: (page.page - 1) * page.size,
        take: page.size,
      }),
      db.bookmark.count({ where }),
    ]);
    return {
      items: rows.map((b) => toResource(b.resource, { bookmarked: true })),
      total,
    };
  }

  const rows = await db.bookmark.findMany({
    where,
    include,
    orderBy,
    take: page.size + 1,
    ...(page.after
      ? {
          cursor: {
            userId_resourceId: { userId: viewerId, resourceId: page.after },
          },
          skip: 1,
        }
      : {}),
  });

  const hasMore = rows.length > page.size;
  const items = hasMore ? rows.slice(0, page.size) : rows;
  return {
    items: items.map((b) => toResource(b.resource, { bookmarked: true })),
    nextCursor: hasMore ? items[items.length - 1]?.resourceId : undefined,
  };
}

/** 소프트 삭제 (`FR-RES-007`). 30일 뒤 워커가 실제로 지운다 (P6) */
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
