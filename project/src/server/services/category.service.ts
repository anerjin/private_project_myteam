import "server-only";

import { db } from "@/lib/db";
import type { CategoryChoice, CategoryNode } from "@/types";

/**
 * 카테고리 트리 (`FR-RES-003`, `REQ-04 · 4.2`).
 *
 * ## 목록이 코드에 적혀 있으면 그것은 **목입니다**
 *
 * `src/mocks/` 를 지웠을 때 「목 부채 0」이라고 셌지만, 그 게이트가 센 것은
 * **import 형태**였습니다. `admin/taxonomy/page.tsx` 안에는 `SUBCATEGORIES`
 * 상수가, `config/site.ts` 에는 `CATEGORIES` 배열이 그대로 남아 있었습니다 —
 * **목은 죽지 않고 화면 파일로 이사했습니다.**
 *
 * 그 사이 `categories` 테이블에는 **27행(대분류 5 + 하위 22)이 이미 있었습니다.**
 * 화면은 그걸 두고 옆에 베껴 둔 값을 그렸고, 둘은 서로 어긋나 있었습니다 —
 * 하드코딩은 `내부`의 하위를 셋(`규약·온보딩·회고`)으로 적었는데 DB 와 slug 가
 * 아예 달랐습니다(`convention`·`onboarding`·`retro`). 즉 **관리자 화면에서
 * 「사내 › 규약」을 본 사람이 그 값으로 필터를 걸면 0건이 나옵니다.**
 *
 * > **그래서 「목 제거」의 확인하는 법은 «`@/mocks` import 가 0인가»가 아니라
 * > «DB 를 비우면 화면도 비는가»입니다.** 문법이 아니라 성질을 봅니다 —
 * > 어떤 모양의 하드코딩이든 걸립니다. `scripts/verify-empty-db.ts` 가 그 확인입니다.
 *
 * ## 계층은 스키마가 이미 표현합니다
 *
 * `Category.parentId` + `CategoryTree` 자기 참조 관계가 처음부터 있었습니다.
 * 그러니 이건 **모델 공백이 아니라 화면이 DB 를 안 읽은 것**이고,
 * 고침은 「UI 를 지우거나 스키마를 늘리기」가 아니라 「DB 에서 읽기」입니다.
 *
 * ## 깊이는 2단계까지입니다 (`FR-SRCH-006`)
 *
 * 자료는 카테고리를 **하나**만 답니다. 재귀 조회를 하지 않는 이유이기도 합니다 —
 * `children` 한 겹이면 끝나서 질의가 한 번입니다.
 *
 * **막는 것은 이 파일이 아니라 스키마입니다** — 마이그레이션의
 * `trg_categories_depth` 트리거가 하위의 하위를 거부합니다. 화면에서 막으면
 * `P7` 의 CLI 나 시드가 그 규칙을 모르고 3단계를 만들 수 있습니다.
 *
 * > `FR-SRCH-006` 은 전에 「2단계 트리로 카테고리를 **관리**한다」였습니다.
 * > 편집은 `FR-ADM-012`(`P8`)가 이미 맡고 있어 **번호 둘이 같은 일을 가리켰고**,
 * > `P4` 를 닫을 때 「`P0` 인데 안 만들었다」로 걸렸습니다. 지금은 구조 제약만
 * > 가리킵니다 (`DEC-049`).
 */

/**
 * 정렬은 **`sortOrder` → 이름** 입니다.
 *
 * `sortOrder` 는 전부 기본값 `0` 일 수 있어(운영자가 아직 정하지 않음)
 * 그때 순서가 조회마다 흔들리면 안 됩니다 — 이름이 그 타이브레이커입니다.
 * `content-type.service` 의 `sortOrder` 판정과 같은 부류의 문제입니다.
 */
const ORDER = [{ sortOrder: "asc" as const }, { name: "asc" as const }];

/**
 * 대분류 + 하위분류. **비활성은 빼고 옵니다** — 운영자가 끈 분류를
 * 화면이 계속 제안하면 「끄기」가 아무 일도 하지 않은 것이 됩니다.
 */
export async function listTree(): Promise<CategoryNode[]> {
  const rows = await db.category.findMany({
    where: { parentId: null, isActive: true },
    orderBy: ORDER,
    select: {
      slug: true,
      name: true,
      icon: true,
      children: {
        where: { isActive: true },
        orderBy: ORDER,
        select: { slug: true, name: true },
      },
    },
  });
  return rows;
}

/**
 * 폼·필터의 선택지.
 *
 * **하위분류도 고를 수 있어야 합니다.** 전에는 대분류 5개만 제안했는데,
 * DB 에는 하위 22개가 있고 자료의 `categoryId` 는 어느 쪽이든 가리킬 수 있습니다 —
 * 화면이 고를 수 없는 값이 데이터에는 존재하는 상태였습니다.
 */
export async function listChoices(): Promise<CategoryChoice[]> {
  const tree = await listTree();
  return tree.flatMap((c) => [
    { slug: c.slug, name: c.name, depth: 0 as const },
    ...c.children.map((s) => ({ slug: s.slug, name: s.name, depth: 1 as const })),
  ]);
}
