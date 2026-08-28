import "server-only";

import type { Prisma, ResourceType } from "@prisma/client";

import {
  orderByFor,
  type ListQuery,
  type PageSpec,
} from "@/features/resources/list.schema";
import { db } from "@/lib/db";

/**
 * 자료 조회 (FR-RES-004~006).
 *
 * **Prisma 질의만 둡니다.** 「볼 수 있는가」·「고칠 수 있는가」는 service 의 일입니다
 * (`DEV-06 · 6.6`).
 *
 * ## 탐색과 관리가 **같은 함수 모양**을 씁니다
 *
 * `list(filter, page)` 의 `page` 가 판별 유니온(`PageSpec`)입니다.
 * UI 만 공유하면 절반이고, **데이터 계층에서도 얹혀야** `DEC-045` 의
 * 「한 번 만들어 얹는다」가 성립합니다 — `P8` 의 관리자 목록이 이 함수를 그대로 씁니다.
 */

/** 목록 카드에 필요한 것만. `body` 는 싣지 않는다 — 1만 건이면 페이로드가 폭발한다 */
export const RESOURCE_CARD_SELECT = {
  id: true,
  type: true,
  slug: true,
  title: true,
  summary: true,
  url: true,
  thumbnailUrl: true,
  sourceChannel: true,
  viewCount: true,
  bookmarkCount: true,
  createdAt: true,
  author: {
    select: { id: true, username: true, name: true, department: true },
  },
  category: { select: { id: true, slug: true, name: true } },
  tags: { select: { tag: { select: { slug: true, label: true } } } },
  /*
   * **타입별 상세도 함께 읽습니다.** 목록 «카드»가 그것을 씁니다 —
   * `ai-material/card.tsx` 가 `materialKind`·`sourceName` 을 그립니다.
   * 1:1 optional 이라 LEFT JOIN 이고, 페이지당 24행이면 비용이 논점이 아닙니다.
   * 여기서 빼면 카드마다 추가 질의가 생겨 N+1 이 됩니다.
   */
  aiMaterial: true,
  githubRepo: true,
  mcpServer: true,
  skill: true,
  devNote: true,
  prompt: true,
} satisfies Prisma.ResourceSelect;

export type ResourceCardRow = Prisma.ResourceGetPayload<{
  select: typeof RESOURCE_CARD_SELECT;
}>;

/**
 * 목록 필터 → `where`.
 *
 * **`deletedAt: null` 이 여기 있습니다.** 소프트 삭제를 호출부마다 기억하게 하면
 * 한 곳은 반드시 빠지고, 그러면 지운 자료가 목록에 나옵니다 (`DEC-036` 과 같은 형태).
 */
function toWhere(
  f: Partial<ListQuery>,
  /** 관리 화면은 휴지통을 봐야 한다 (`FR-RES-012`) */
  scope: "live" | "trash" = "live"
): Prisma.ResourceWhereInput {
  return {
    ...(scope === "trash"
      ? { deletedAt: { not: null } }
      : { deletedAt: null, status: "PUBLISHED" }),
    ...(f.type ? { type: f.type as ResourceType } : {}),
    ...(f.category ? { category: { slug: f.category } } : {}),
    ...(f.tag ? { tags: { some: { tag: { slug: f.tag } } } } : {}),
    ...(f.author ? { author: { username: f.author } } : {}),
  };
}

/**
 * 전문 검색 (`FR-SRCH-001`, `DEC-007`).
 *
 * **`search_vector` 와 GIN 인덱스는 처음부터 있었는데 아무도 쓰지 않았습니다** —
 * 목록이 `title contains` 로만 찾고 있었고, 그건 `ILIKE '%…%'` 라
 * **인덱스를 타지 못하고 본문도 못 봅니다.**
 *
 * Prisma 는 tsvector 를 모르므로 raw 로 **id 만** 뽑아 `where` 에 합칩니다.
 * 결과 조립은 그대로 Prisma 가 하므로 select·정렬·페이징 규칙이 갈라지지 않습니다.
 *
 * `websearch_to_tsquery` 를 쓰는 이유: 사용자가 적는 그대로(`따옴표`·`OR`·`-제외`)를
 * 받아 주고, **문법이 틀려도 예외를 던지지 않습니다.** `to_tsquery` 는 `a &` 같은
 * 입력에 에러를 내는데, 검색창은 사람이 아무거나 치는 곳입니다.
 *
 * 한국어 형태소 사전이 없어 `simple` 을 씁니다(마이그레이션 주석 참고).
 * 그래서 «드론» 으로 «드론영상» 이 안 잡히고, 그 보완이 `title` 의 trgm 인덱스입니다 —
 * **두 결과를 합칩니다.**
 */
const SEARCH_CANDIDATE_LIMIT = 2000;

async function searchIds(q: string): Promise<string[]> {
  /*
   * **`ORDER BY` 없이 자르면 «아무 2000건»이 됩니다.**
   * 흔한 낱말이 5000건을 물면 잘려 나간 3000건이 무엇인지 규칙이 없고,
   * 사용자는 「최신순으로 봤는데 어제 글이 없다」를 겪습니다.
   * **관련도 순으로 자릅니다** — 그러면 잘리는 것은 항상 «덜 관련된 것»이고,
   * 그 뒤의 정렬(최신순 등)은 남은 후보 안에서 이뤄집니다.
   */
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id,
           ts_rank(search_vector, websearch_to_tsquery('simple', unaccent(${q}))) AS rank
    FROM resources
    WHERE deleted_at IS NULL
      AND (
        search_vector @@ websearch_to_tsquery('simple', unaccent(${q}))
        OR title ILIKE ${"%" + q + "%"}
      )
    ORDER BY rank DESC
    LIMIT ${SEARCH_CANDIDATE_LIMIT}
  `;
  return rows.map((r) => r.id);
}

export interface ListResult {
  items: ResourceCardRow[];
  /** 커서 모드 — 다음 페이지가 있으면 마지막 항목의 id */
  nextCursor?: string;
  /** 오프셋 모드 — 전체 개수. 커서 모드에서는 «세지 않습니다» */
  total?: number;
}

export async function list(
  filter: Partial<ListQuery>,
  page: PageSpec,
  scope: "live" | "trash" = "live"
): Promise<ListResult> {
  const orderBy = [...orderByFor(filter.sort ?? "recent", filter.dir)];

  /*
   * 검색어가 있으면 **FTS 가 후보를 좁히고** 나머지 필터·정렬·페이징은 그대로 갑니다.
   * 상한 2000 은 「검색 결과를 끝까지 넘겨보는 사람은 없다」는 판단입니다 —
   * 없으면 «드론» 같은 흔한 말이 전체를 다 끌고 옵니다.
   */
  const where: Prisma.ResourceWhereInput = filter.q
    ? { ...toWhere(filter, scope), id: { in: await searchIds(filter.q) } }
    : toWhere(filter, scope);

  if (page.kind === "cursor") {
    /*
     * **`size + 1` 을 가져와 다음 페이지 유무를 압니다.**
     * `count` 를 따로 하지 않는 것이 커서를 쓰는 이유의 절반입니다 —
     * 1만 건에서 `COUNT(*)` 는 매 요청 전체 스캔입니다.
     */
    const rows = await db.resource.findMany({
      where,
      select: RESOURCE_CARD_SELECT,
      orderBy,
      take: page.size + 1,
      ...(page.after ? { cursor: { id: page.after }, skip: 1 } : {}),
    });

    const hasMore = rows.length > page.size;
    const items = hasMore ? rows.slice(0, page.size) : rows;
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
    };
  }

  // 관리 화면 — 「총 N건 중 2페이지」를 보여줘야 하므로 센다
  const [items, total] = await Promise.all([
    db.resource.findMany({
      where,
      select: RESOURCE_CARD_SELECT,
      orderBy,
      skip: (page.page - 1) * page.size,
      take: page.size,
    }),
    db.resource.count({ where }),
  ]);
  return { items, total };
}

/** 휴지통 건수 — 탭 라벨에 쓴다 */
export function countTrashed(): Promise<number> {
  return db.resource.count({ where: { deletedAt: { not: null } } });
}

/** 상세 — 타입별 상세 테이블을 함께 읽는다 (REQ-04 · 4.4) */
export function findBySlug(slug: string) {
  return db.resource.findFirst({
    where: { slug, deletedAt: null },
    include: {
      author: {
        select: { id: true, username: true, name: true, department: true },
      },
      category: { select: { id: true, slug: true, name: true } },
      tags: { select: { tag: { select: { slug: true, label: true } } } },
      aiMaterial: true,
      githubRepo: true,
      mcpServer: true,
      skill: true,
      devNote: true,
      prompt: true,
    },
  });
}

export function findById(id: string) {
  return db.resource.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, slug: true, type: true, authorId: true, title: true },
  });
}

/** URL 중복 확인 (FR-RES-002) — 정규화된 값으로 본다 */
export function findByUrl(urlNormalized: string) {
  return db.resource.findFirst({
    where: { urlNormalized, deletedAt: null },
    select: { id: true, slug: true, type: true, title: true },
  });
}

export function isSlugTaken(slug: string) {
  return db.resource
    .findUnique({ where: { slug }, select: { id: true } })
    .then((r) => r !== null);
}
