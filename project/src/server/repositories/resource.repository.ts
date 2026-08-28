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
  // 초안 판정은 service 가 한다 — mapper 가 값을 박아 넣지 않도록 실어 보낸다
  status: true,
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
    ...(f.days
      ? {
          createdAt: {
            gte: new Date(Date.now() - f.days * 24 * 60 * 60 * 1000),
          },
        }
      : {}),
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
/**
 * 후보 상한 (`DEC-048`). **이 구조의 부작용이 아니라 요구입니다** —
 * `id IN (…)` 리스트가 커지면 Postgres 파싱 비용이 급격히 나빠지므로,
 * 상한을 없애려면 raw 를 본 질의로 만들어야 하고 그러면 select·정렬·페이징이
 * 두 곳으로 갈려 `DEC-045`(P8 재사용)와 정렬 표 단일 출처가 깨집니다.
 */
const SEARCH_CANDIDATE_LIMIT = 2000;

interface SearchCandidates {
  ids: string[];
  /** 상한에 닿았는가 — 화면이 「검색어를 좁혀 주세요」를 띄우는 근거 */
  truncated: boolean;
}

async function searchIds(q: string): Promise<SearchCandidates> {
  /*
   * **`ORDER BY rank DESC` 만으로는 절단이 결정적이지 않습니다.**
   *
   * > 전에 이 자리 주석은 *"관련도 순으로 자르니 잘리는 것은 항상 «덜 관련된 것»"*
   * > 이라고 적혀 있었습니다. **거짓입니다.** `ts_rank` 는 FTS 분기만 정렬하고,
   * > `title ILIKE` 로만 걸린 행은 **전부 rank 0 동점**입니다. Postgres 는 동점을
   * > 임의 순서로 내므로 «덜 관련된 것»이 아니라 «plan 이 정하는 아무거나»가 잘렸고,
   * > 그 순서는 실행마다 달라질 수 있어 **같은 검색이 요청마다 다른 결과**를
   * > 낼 수 있었습니다. 잘림보다 이쪽이 나쁩니다.
   *
   * `, id DESC` 는 절단을 «의미 있게» 만들지 않습니다 — **안정되게** 만듭니다.
   * 무엇이 잘리는가보다 **매번 같은 것이 잘리는가**가 먼저입니다.
   *
   * `status` 를 여기 넣지 않는 것은 **의도한 선택**입니다. 넣으면 실효 상한이
   * 올라가지만 `toWhere` 의 일부가 SQL 로 복제되어 필터 판정이 두 곳이 됩니다.
   * 대신 아래 `truncated` 가 그 손실까지 포함해 말합니다 — 초안·보관 행이 후보
   * 자리를 차지해 실효 상한이 2000보다 낮아지는 것도 같은 신호에 잡힙니다.
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
    ORDER BY rank DESC, id DESC
    LIMIT ${SEARCH_CANDIDATE_LIMIT + 1}
  `;

  /*
   * **한 건 더 뽑아 상한에 닿았는지 압니다.** 별도 `COUNT` 없이 공짜이고,
   * 커서 페이징이 `size + 1` 로 「다음 페이지 있음」을 아는 것과 같은 수법입니다.
   * 사람이 짐작해 띄우는 문구가 아니라 **질의가 말합니다.**
   */
  const truncated = rows.length > SEARCH_CANDIDATE_LIMIT;
  const kept = truncated ? rows.slice(0, SEARCH_CANDIDATE_LIMIT) : rows;
  return { ids: kept.map((r) => r.id), truncated };
}

export interface ListResult {
  items: ResourceCardRow[];
  /** 커서 모드 — 다음 페이지가 있으면 마지막 항목의 id */
  nextCursor?: string;
  /** 오프셋 모드 — 전체 개수. 커서 모드에서는 «세지 않습니다» */
  total?: number;
  /**
   * 검색 후보가 상한에 닿았는가 (`DEC-048`).
   * 이때는 **뒤쪽 결과가 실제로 없습니다** — 화면이 그 사실을 말해야 합니다.
   */
  searchTruncated?: boolean;
}

export async function list(
  filter: Partial<ListQuery>,
  page: PageSpec,
  scope: "live" | "trash" = "live"
): Promise<ListResult> {
  const orderBy = [...orderByFor(filter.sort ?? "recent", filter.dir)];

  /*
   * 검색어가 있으면 **FTS 가 후보를 좁히고** 나머지 필터·정렬·페이징은 그대로 갑니다.
   * 상한은 `DEC-048` 이고, **닿았으면 화면에 말합니다** — 조용히 자르면
   * 사용자는 「없다」와 「안 보여준다」를 구별할 수 없습니다.
   */
  let searchTruncated: boolean | undefined;
  let where: Prisma.ResourceWhereInput;
  if (filter.q) {
    const c = await searchIds(filter.q);
    searchTruncated = c.truncated;
    where = { ...toWhere(filter, scope), id: { in: c.ids } };
  } else {
    where = toWhere(filter, scope);
  }

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
      searchTruncated,
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
  return { items, total, searchTruncated };
}

/** 휴지통 건수 — 탭 라벨에 쓴다 */
export function countTrashed(): Promise<number> {
  return db.resource.count({ where: { deletedAt: { not: null } } });
}

/**
 * 상세 — 타입별 상세 테이블을 함께 읽는다 (REQ-04 · 4.4).
 *
 * **`status` 는 여기서 거르지 않습니다.** 초안은 「작성자와 `EDITOR` 이상은 본다」라
 * 역할을 알아야 판정할 수 있고, 그건 service 의 일입니다 (`DEV-06 · 6.6`).
 * 그래서 `status` 를 **선택해서 올려 보냅니다** — 전에는 select 에도 없어서
 * mapper 가 `"PUBLISHED"` 를 박아 넣고 있었습니다.
 */
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
