import { z } from "zod";

/**
 * 자료 목록의 **URL 상태** (FR-RES-004~006, `DEC-045`).
 *
 * ## 목록 상태의 정본은 `searchParams` 입니다
 *
 * 클라이언트 state 로 두면 **서버가 필터링할 수 없습니다** — `DEC-045` 가 통째로
 * 무의미해지고, 새로고침·뒤로가기·링크 공유가 전부 깨집니다.
 * 화면은 URL 을 바꾸고, 서버는 URL 을 읽습니다.
 *
 * ## 정렬 허용 컬럼을 여기 둡니다
 *
 * `orderBy` 를 사용자 입력으로 그대로 넘기면 **Prisma 에 임의 필드가 들어갑니다.**
 * 허용 목록을 한 곳에 두고 화면·서버가 함께 읽습니다
 * (`features/members/schema.ts` 의 `TRANSITION_FROM` 과 같은 자리·같은 이유).
 *
 * ## 페이징은 **탐색/관리** 축으로 가릅니다
 *
 * | 축 | 화면 | 방식 | 이유 |
 * | --- | --- | --- | --- |
 * | **탐색** | 서비스 자료 목록 · 검색 결과 | **커서** | 흘러가며 본다. 총 개수·페이지 번호가 필요 없고 1만 건에서 안정적 |
 * | **관리** | 관리자 자료 · 회원 · 감사 로그 | **오프셋** | 「총 N건 중 2페이지」를 알아야 하고 특정 페이지로 점프한다 |
 *
 * **「자료 = 커서」가 아닙니다.** 그렇게 가르면 `/admin/resources` 가 갈 곳이 없어집니다 —
 * 그 화면은 자료지만 **관리** 화면이라 점프가 필요합니다. 탐색/관리로 가르면
 * `P8` 의 관리자 자료 목록이 회원 목록과 **같은 오프셋 컴포넌트**를 씁니다.
 *
 * 공유: **질의 파라미터 이름(`q`·`sort`·`dir`) · 정렬 허용 표 · 빈 상태/로딩 ·
 * 리포지토리 시그니처.** 가르는 것: **`cursor` vs `page` 하나뿐입니다.**
 *
 * > 오프셋이 지금 괜찮은 이유는 **관리 목록이 필터로 좁혀지기 때문**입니다.
 * > 깊은 페이지(`OFFSET 9000`)를 필터 없이 넘기는 화면이 생기면 다시 봐야 합니다.
 */

export const RESOURCE_TYPES = [
  "AI_MATERIAL",
  "GITHUB_REPO",
  "MCP_SERVER",
  "SKILL",
  "DEV_NOTE",
  "PROMPT",
] as const;

/**
 * 정렬 축. **키는 URL 에 나가는 값**이고, 실제 컬럼 매핑은 repository 가 합니다 —
 * 화면이 Prisma 필드명을 알 필요가 없습니다.
 *
 * 타입 전용 정렬(예: 아카이브 크기)이 필요해지면 **여기에 추가**하고
 * 해당 타입에서만 노출합니다. 콘텐츠 타입 레지스트리에 흩으면
 * 「어떤 정렬이 가능한가」를 한눈에 볼 수 없게 됩니다.
 */
export const SORT_KEYS = ["recent", "popular", "title"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const SORT_LABEL: Record<SortKey, string> = {
  recent: "최신순",
  popular: "많이 본 순",
  title: "제목순",
};

/** 방향도 열거로 좁힌다 — 문자열을 그대로 넘기면 표를 둔 의미가 없다 */
export const SORT_DIRS = ["asc", "desc"] as const;
export type SortDir = (typeof SORT_DIRS)[number];

/**
 * **API 이름 → Prisma 필드 매핑.** 여기가 `P4` 에서 유일하게 보안이 걸린 지점입니다.
 *
 * `{ [sort]: dir }` 로 통과시키면 안 됩니다 — Prisma 는 **관계 필드와 중첩
 * `orderBy` 를 받아 주므로**, 사용자 입력이 그대로 들어가면 정렬을 통해 다른
 * 테이블을 건드리거나 질의를 폭발시킬 수 있습니다.
 * 표에 «없는» 값은 오류가 아니라 **기본 정렬**로 떨어집니다 (URL 은 사람이 손으로 고칩니다).
 *
 * 각 축에 **`id` 를 타이브레이커로** 붙입니다. 같은 값이 여럿이면 커서가 흔들려
 * 항목이 중복되거나 건너뛰어집니다.
 */
const SORT_FIELD: Record<SortKey, "createdAt" | "viewCount" | "title"> = {
  recent: "createdAt",
  popular: "viewCount",
  title: "title",
};

/** 이 축의 «자연스러운» 방향. 사용자가 `dir` 를 안 주면 이것을 쓴다 */
const SORT_DEFAULT_DIR: Record<SortKey, SortDir> = {
  recent: "desc",
  popular: "desc",
  title: "asc",
};

export function orderByFor(sort: SortKey, dir?: SortDir) {
  const field = SORT_FIELD[sort];
  const d = dir ?? SORT_DEFAULT_DIR[sort];
  // 타이브레이커는 커서 방향과 같아야 한다
  return [{ [field]: d }, { id: d }] as const;
}

/** 한 번에 가져올 개수. 화면과 서버가 같은 값을 본다 */
export const PAGE_SIZE = 24;

/**
 * `searchParams` → 검증된 목록 조건.
 *
 * **전부 optional 이고 실패하면 기본값으로 떨어집니다.** 목록 화면은 사람이 URL 을
 * 손으로 고치기도 하는 곳이라, 이상한 값 하나로 500 을 띄우면 안 됩니다 —
 * 「모르는 정렬 키」는 오류가 아니라 **기본 정렬**입니다.
 */
export const listQuerySchema = z.object({
  // ── 탐색·관리가 «같은 이름»으로 공유하는 것 ──
  q: z.string().trim().max(100).optional().catch(undefined),
  type: z.enum(RESOURCE_TYPES).optional().catch(undefined),
  category: z.string().max(50).optional().catch(undefined),
  tag: z.string().max(50).optional().catch(undefined),
  /** 등록자 아이디. **화면이 가진 목록에서 뽑지 않습니다** — 서버 페이징 뒤에는
   *  현재 페이지의 등록자만 보이게 되어 필터가 거짓말을 합니다 */
  author: z.string().max(30).optional().catch(undefined),
  sort: z.enum(SORT_KEYS).default("recent").catch("recent"),
  dir: z.enum(SORT_DIRS).optional().catch(undefined),
  // ── 여기만 갈립니다 ──
  /** 탐색(커서) — 직전 페이지 마지막 항목의 id */
  cursor: z.string().max(40).optional().catch(undefined),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

/**
 * 관리 화면용 페이지 번호 (`P8` 이 같은 파서를 쓴다).
 * 1부터. 이상한 값은 1로 떨어집니다.
 */
export const pageSchema = z.coerce.number().int().min(1).default(1).catch(1);

/**
 * 리포지토리가 받는 «페이지 지정». **탐색과 관리가 같은 함수 모양을 씁니다** —
 * UI 만 공유하면 절반이고, 데이터 계층에서도 얹혀야 「한 번 만들어 얹는다」가 됩니다.
 */
export type PageSpec =
  | { kind: "cursor"; after?: string; size: number }
  | { kind: "offset"; page: number; size: number };

/** `searchParams` 객체를 그대로 넣는다. 배열로 온 값은 첫 번째만 본다 */
export function parseListQuery(
  raw: Record<string, string | string[] | undefined>
): ListQuery {
  const flat = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );
  return listQuerySchema.parse(flat);
}

/**
 * 조건을 URL 로 되돌린다 — **화면이 링크를 만들 때 씁니다.**
 * 조건을 바꾸면 커서를 버립니다(1페이지로). 안 버리면 필터를 바꿨는데
 * 엉뚱한 지점부터 나옵니다.
 */
export function toSearchParams(
  q: Partial<ListQuery>,
  patch: Partial<ListQuery> = {}
): string {
  const next = { ...q, ...patch };
  if (!("cursor" in patch)) delete next.cursor;

  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) {
    if (v && !(k === "sort" && v === "recent")) sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
