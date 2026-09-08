import "server-only";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/server/auth/actor";
import * as audit from "@/server/services/audit.service";
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
    ...c.children.map((s) => ({
      slug: s.slug,
      name: s.name,
      depth: 1 as const,
    })),
  ]);
}

/* ────────────────────────────────────────────────────────────────────────
 * 쓰기 — 카테고리 관리 (`FR-ADM-012`)
 *
 * ## 누가 할 수 있는가 — **로그인한 사람** (`DEC-077`)
 *
 * 🔄 전에는 `assertAdmin(actor)` 이 이 파일의 쓰기 넷 앞에 서 있었고,
 *    「매트릭스는 `EDITOR`, 화면은 `ADMIN` 이라 둘이 어긋났다 → 매트릭스를 고쳤다」
 *    (`DEC-057`·`OPEN-016`)가 그 근거였습니다. 등급이 사라지면서 그 판정이 언제나
 *    통과가 되어 **검사를 지웠습니다** — 언제나 참인 `assertAdmin` 을 남겨 두면
 *    다음 사람이 없는 등급을 찾습니다.
 *
 * 남은 문은 두 개입니다:
 * - 액션(`taxonomy.actions`)의 `requireActor()` — 로그인한 계정인가
 * - 화면(`/admin/taxonomy`)의 `requireActiveUser()` — 같은 질문, page 쪽
 *
 * **에이전트는 여기 닿지 않습니다.** `/api/ingest/taxonomy` 는 읽기 전용이고
 * (`listTree`), 쓰기 넷을 여는 라우트가 없습니다. 여는 날에는 스코프를 하나
 * 만들어야 합니다 — 그때 이 자리는 다시 검사를 갖습니다.
 * ──────────────────────────────────────────────────────────────────────── */

/** 깊이 2단계 상한 (`FR-SRCH-006`). DB 트리거도 같은 것을 막습니다 */
const MAX_DEPTH = 2;

/**
 * 카테고리 생성.
 *
 * **slug 는 사람이 정합니다.** 제목에서 만들어 주면 한글 이름이 퍼센트 인코딩된
 * 주소가 되고(`P6` 에서 실제로 겪었습니다), 카테고리 slug 는 **필터 주소에
 * 그대로 실립니다** — 자료 slug 와 달리 사람이 손으로 칠 일이 많습니다.
 */
export async function create(
  actor: Actor,
  input: { name: string; slug: string; parentSlug?: string; icon?: string }
): Promise<{ slug: string }> {
  return db.$transaction(async (tx) => {
    let parentId: string | null = null;
    if (input.parentSlug) {
      const parent = await tx.category.findUnique({
        where: { slug: input.parentSlug },
        select: { id: true, parentId: true },
      });
      if (!parent) {
        throw new AppError("NOT_FOUND", "상위 분류를 찾을 수 없습니다.");
      }
      /*
       * **깊이를 여기서도 봅니다.** DB 트리거가 막지만, 트리거가 내는 오류는
       * 사용자에게 「처리 중 문제가 발생했습니다」로 보입니다 —
       * 무엇이 잘못됐는지 말할 수 있을 때는 말합니다.
       */
      if (parent.parentId !== null) {
        throw new AppError(
          "VALIDATION_ERROR",
          `분류는 ${MAX_DEPTH}단계까지입니다. 하위분류 아래에 또 만들 수 없습니다.`
        );
      }
      parentId = parent.id;
    }

    const dup = await tx.category.findUnique({
      where: { slug: input.slug },
      select: { name: true },
    });
    if (dup) {
      throw new AppError(
        "DUPLICATE",
        `이미 있는 주소입니다: ${input.slug} (${dup.name}).`
      );
    }

    // 새 항목은 **맨 뒤**로 — 기존 순서를 흔들지 않습니다
    const last = await tx.category.aggregate({
      where: { parentId },
      _max: { sortOrder: true },
    });

    const created = await tx.category.create({
      data: {
        name: input.name,
        slug: input.slug,
        parentId,
        icon: input.icon,
        sortOrder: (last._max.sortOrder ?? 0) + 10,
      },
      select: { id: true, slug: true },
    });

    await audit.log(
      actor,
      {
        action: "SETTING_UPDATE",
        targetType: "category",
        targetId: created.id,
        summary: `분류 추가 — ${input.name} (${input.slug})`,
      },
      tx
    );
    return { slug: created.slug };
  });
}

/**
 * 이름·아이콘·노출 수정.
 *
 * **`slug` 는 못 바꿉니다.** 필터 주소에 실려 있어서 바꾸는 순간 남이 공유한
 * 링크가 전부 죽습니다. 이름을 고치는 것으로 충분하고, 정말 주소를 바꿔야
 * 하면 새로 만들고 자료를 옮기는 것이 **무엇이 일어나는지 보이는** 방법입니다.
 */
export async function update(
  actor: Actor,
  slug: string,
  input: { name?: string; icon?: string | null; isActive?: boolean }
): Promise<void> {
  await db.$transaction(async (tx) => {
    const target = await tx.category.findUnique({
      where: { slug },
      select: { id: true, name: true, icon: true, isActive: true },
    });
    if (!target) throw new AppError("NOT_FOUND", "분류를 찾을 수 없습니다.");

    await tx.category.update({
      where: { id: target.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    await audit.log(
      actor,
      {
        action: "SETTING_UPDATE",
        targetType: "category",
        targetId: target.id,
        summary: `분류 수정 — ${input.name ?? target.name} (${slug})`,
        diff: {
          ...(input.name !== undefined
            ? { name: { before: target.name, after: input.name } }
            : {}),
          ...(input.isActive !== undefined
            ? {
                isActive: {
                  before: String(target.isActive),
                  after: String(input.isActive),
                },
              }
            : {}),
        },
      },
      tx
    );
  });
}

/**
 * 순서 변경 — **형제 목록 전체**를 받습니다.
 *
 * 「이 항목을 위로」 식으로 하나만 받으면 두 관리자가 동시에 움직였을 때
 * 순서가 뒤엉킵니다. 목록 전체를 받아 **그 순간의 배열을 그대로** 씁니다 —
 * 마지막에 저장한 사람의 순서가 남고, 그건 화면에서 본 대로입니다.
 */
export async function reorder(actor: Actor, slugs: string[]): Promise<void> {
  if (slugs.length === 0) return;

  await db.$transaction(async (tx) => {
    const rows = await tx.category.findMany({
      where: { slug: { in: slugs } },
      select: { id: true, slug: true, parentId: true },
    });
    if (rows.length !== slugs.length) {
      throw new AppError("NOT_FOUND", "없는 분류가 목록에 있습니다.");
    }
    /*
     * **형제끼리만 정렬합니다.** 부모가 섞인 목록을 받으면 화면이 보던 것과
     * 다른 결과가 나옵니다 — 순서는 형제 안에서만 의미가 있습니다.
     */
    const parents = new Set(rows.map((r) => r.parentId));
    if (parents.size > 1) {
      throw new AppError(
        "VALIDATION_ERROR",
        "같은 상위 분류의 항목만 함께 정렬할 수 있습니다."
      );
    }

    const bySlug = new Map(rows.map((r) => [r.slug, r.id]));
    for (const [i, s] of slugs.entries()) {
      await tx.category.update({
        where: { id: bySlug.get(s)! },
        data: { sortOrder: (i + 1) * 10 },
      });
    }

    await audit.log(
      actor,
      {
        action: "SETTING_UPDATE",
        targetType: "category",
        summary: `분류 순서 변경 — ${slugs.length}개`,
        diff: { order: { before: "-", after: slugs.join(" > ") } },
      },
      tx
    );
  });
}

/**
 * 삭제 — **자료를 어디로 옮길지 함께 받습니다** (`FR-ADM-012`).
 *
 * ## 자료가 있으면 그냥 못 지웁니다
 *
 * `resources.category_id` 는 `SetNull` 이 아닙니다. 그냥 지우면 FK 위반으로
 * 실패하고, 그 오류는 관리자에게 「처리 중 문제가 발생했습니다」로 보입니다.
 * 그래서 **몇 건이 딸려 있는지 말하고 옮길 곳을 묻습니다** — `moveTo` 가
 * `null` 이면 「분류 없음」으로 보냅니다.
 *
 * ## 하위분류가 있으면 못 지웁니다
 *
 * 하위를 함께 지우면 그 아래 자료까지 조용히 움직입니다. 관리자가 하위를
 * 먼저 정리하게 합니다 — **한 번에 하나씩 일어나는 편**이 무엇이 일어났는지
 * 알기 쉽습니다.
 */
export async function remove(
  actor: Actor,
  slug: string,
  moveTo: string | null
): Promise<{ moved: number }> {
  return db.$transaction(async (tx) => {
    const target = await tx.category.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        _count: { select: { children: true, resources: true } },
      },
    });
    if (!target) throw new AppError("NOT_FOUND", "분류를 찾을 수 없습니다.");

    if (target._count.children > 0) {
      throw new AppError(
        "INVALID_STATE",
        `하위분류 ${target._count.children}개를 먼저 정리해 주세요.`
      );
    }

    let moved = 0;
    if (target._count.resources > 0) {
      let nextId: string | null = null;
      if (moveTo) {
        const dest = await tx.category.findUnique({
          where: { slug: moveTo },
          select: { id: true },
        });
        if (!dest) {
          throw new AppError("NOT_FOUND", "옮길 분류를 찾을 수 없습니다.");
        }
        if (dest.id === target.id) {
          throw new AppError(
            "VALIDATION_ERROR",
            "자기 자신으로는 옮길 수 없습니다."
          );
        }
        nextId = dest.id;
      }
      const r = await tx.resource.updateMany({
        where: { categoryId: target.id },
        data: { categoryId: nextId },
      });
      moved = r.count;
    }

    await tx.category.delete({ where: { id: target.id } });

    await audit.log(
      actor,
      {
        action: "SETTING_UPDATE",
        targetType: "category",
        targetId: target.id,
        summary: `분류 삭제 — ${target.name} (${slug})`,
        diff: {
          resources: {
            before: String(target._count.resources),
            after: moveTo ? `→ ${moveTo}` : "분류 없음",
          },
        },
      },
      tx
    );

    return { moved };
  });
}

/**
 * 관리 화면이 보는 트리 — **비활성도 함께** 봅니다.
 *
 * `listTree` 는 사용자용이라 `isActive` 를 거릅니다. 관리 화면이 그것을 쓰면
 * **끈 분류가 화면에서 사라져 다시 켤 수 없습니다** — 「끄기」가 사실상
 * 「지우기」가 됩니다.
 */
export async function listAllForAdmin(): Promise<
  {
    slug: string;
    name: string;
    icon: string | null;
    isActive: boolean;
    resourceCount: number;
    children: {
      slug: string;
      name: string;
      isActive: boolean;
      resourceCount: number;
    }[];
  }[]
> {
  const rows = await db.category.findMany({
    where: { parentId: null },
    orderBy: ORDER,
    select: {
      slug: true,
      name: true,
      icon: true,
      isActive: true,
      _count: { select: { resources: true } },
      children: {
        orderBy: ORDER,
        select: {
          slug: true,
          name: true,
          isActive: true,
          _count: { select: { resources: true } },
        },
      },
    },
  });

  return rows.map((c) => ({
    slug: c.slug,
    name: c.name,
    icon: c.icon,
    isActive: c.isActive,
    resourceCount: c._count.resources,
    children: c.children.map((s) => ({
      slug: s.slug,
      name: s.name,
      isActive: s.isActive,
      resourceCount: s._count.resources,
    })),
  }));
}
