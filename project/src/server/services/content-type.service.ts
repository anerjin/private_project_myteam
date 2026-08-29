import "server-only";

import { listOperational } from "@/features/resources/content-types/operational";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { isAdmin, type Actor } from "@/server/auth/actor";
import * as audit from "@/server/services/audit.service";
import type { ResourceType } from "@/types";

/**
 * 콘텐츠 타입의 **운영 설정** (`DEC-032`, `FR-ADM-014`).
 *
 * ## 표현은 코드, 운영은 DB
 *
 * 라벨·아이콘·필드 구조·폼은 **코드**(`content-types/` 레지스트리)에 있습니다 —
 * 관리자 화면에서 스키마를 정의하게 하면 타입 안정성과 마이그레이션 추적을 잃습니다.
 * DB 가 갖는 것은 **노출 여부·순서** 셋뿐입니다.
 *
 * ## 행이 없으면 **레지스트리 값이 이깁니다**
 *
 * 새 타입을 코드에 추가하면 `content_type_settings` 에는 행이 없습니다.
 * 그때 「없으니 숨김」으로 처리하면 **새 타입이 조용히 사라집니다** —
 * 개발자는 폴더를 만들고 레지스트리에 등록했는데 화면에 안 나오는 것을 겪습니다.
 * 없는 것은 「아직 운영자가 손대지 않았다」이므로 **코드의 기본값**을 씁니다.
 *
 * ## `content-types/index.ts` 가 아니라 `operational.ts` 를 읽습니다
 *
 * 레지스트리는 `Card`·`Detail`·`Form`(React 컴포넌트)과 아이콘을 끌고 옵니다.
 * service 가 그것을 import 하면 **서버 그래프에 화면 컴포넌트가 들어옵니다** —
 * `schemas.ts` 를 따로 둔 것과 같은 이유이고, 처음에 레지스트리를 읽었다가
 * 검증 스크립트가 React 런타임 없이 돌지 못하는 것으로 드러났습니다.
 */

export interface TypeSetting {
  code: ResourceType;
  slug: string;
  label: string;
  description: string;
  showInNav: boolean;
  isActive: boolean;
  sortOrder: number;
}

export async function listSettings(): Promise<TypeSetting[]> {
  const rows = await db.contentTypeSetting.findMany();
  const byType = new Map(rows.map((r) => [r.type as ResourceType, r]));

  return listOperational()
    .map((t) => {
      const row = byType.get(t.code);
      return {
        code: t.code,
        slug: t.slug,
        label: t.label,
        description: t.description,
        // 행이 있으면 DB 가 이기고, 없으면 레지스트리 기본값
        showInNav: row?.showInNav ?? t.showInNav,
        isActive: row?.isActive ?? t.isActive,
        /*
         * **`?? ` 로는 `sortOrder` 를 못 씁니다.** 스키마 기본값이 `0` 이라
         * `0 ?? 60` 은 `0` 이고, `showInNav` «만» 끄려는 조작이 행을 만드는 순간
         * **사이드바 순서가 뒤집힙니다** (실측: `prompt` 가 60 → 0 이 되어 맨 앞으로).
         * 운영자가 순서를 정하지 않았다는 뜻의 `0` 과 「0번으로 두고 싶다」를
         * 구별할 수 없으므로, **양수일 때만 DB 를 따릅니다.**
         */
        sortOrder: row && row.sortOrder > 0 ? row.sortOrder : t.sortOrder,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * 사이드바에 낼 타입.
 *
 * **`isActive` 가 꺼진 타입은 `showInNav` 와 무관하게 뺍니다.**
 * 「비활성인데 메뉴에는 있다」는 상태를 만들 수 있게 두면 그 조합이 실제로 생깁니다.
 */
export async function navTypes(): Promise<TypeSetting[]> {
  const all = await listSettings();
  return all.filter((t) => t.isActive && t.showInNav);
}

/* ────────────────────────────────────────────────────────────────────────
 * 쓰기 — 콘텐츠 타입 운영 설정 (`FR-ADM-014`)
 *
 * ## 요구사항과 결정이 어긋난 자리입니다 (`DEC-058`)
 *
 * `REQ-03` 의 `FR-ADM-014` 수용 기준은 설정 항목에 **「표시 라벨, 아이콘,
 * 설명」**을 넣었는데, `DEC-032` 는 **「표현은 코드, 운영은 DB」**로 정했고
 * `content_type_settings` 테이블에는 그 세 칸이 아예 없습니다.
 *
 * `DEC-032` 를 따릅니다 — 라벨·아이콘·설명은 **폼·카드·상세 렌더러와 함께
 * 움직이는 것**이라 코드에 있어야 타입 하나가 한 덩어리로 유지됩니다
 * (`REQ-04 · 4.9` 의 「타입을 코드로 추가하면 자동 연결」이 그 전제입니다).
 * DB 로 내리면 라벨만 바뀌고 아이콘 컴포넌트는 그대로인 상태가 가능해집니다.
 *
 * 그래서 여기서 바꾸는 것은 **활성 여부 · 사이드바 노출 · 정렬 순서** 셋입니다.
 * ──────────────────────────────────────────────────────────────────────── */

export interface TypeSettingInput {
  code: ResourceType;
  isActive: boolean;
  showInNav: boolean;
}

/**
 * 설정 저장 — **목록 전체**를 받습니다.
 *
 * 순서는 배열 순서입니다. 한 개씩 받으면 두 관리자가 동시에 움직였을 때
 * 순서가 뒤엉키고, 화면에서 본 것과 다른 결과가 남습니다
 * (`category.service.reorder` 와 같은 판단).
 *
 * **`ADMIN` 만 부릅니다.** 분류 정리는 `EDITOR` 도 하지만(`DEC-057`),
 * 타입을 끄면 등록 화면에서 **통째로 사라지고** 기존 자료가 목록에서 숨습니다.
 */
export async function updateSettings(
  actor: Actor,
  items: TypeSettingInput[]
): Promise<void> {
  if (!isAdmin(actor)) {
    throw new AppError("FORBIDDEN", "콘텐츠 타입 설정은 관리자만 바꿀 수 있습니다.");
  }

  const known = new Set(listOperational().map((t) => t.code));
  for (const it of items) {
    if (!known.has(it.code)) {
      throw new AppError("VALIDATION_ERROR", `없는 타입입니다: ${it.code}`);
    }
  }

  /*
   * **`isActive` 가 꺼진 타입은 `showInNav` 도 끕니다.**
   *
   * 「비활성인데 메뉴에는 있다」는 조합은 화면에서 만들 수 없게 막아도,
   * **액션으로는 만들 수 있습니다** — 인가와 같은 이유로 서버가 다시 봅니다.
   * `navTypes()` 가 둘 다 보므로 결과는 같지만, 저장된 값이 모순이면
   * 다음에 그 표를 읽는 사람이 헷갈립니다.
   */
  const normalized = items.map((it) => ({
    ...it,
    showInNav: it.isActive && it.showInNav,
  }));

  const before = await listSettings();

  await db.$transaction(async (tx) => {
    for (const [i, it] of normalized.entries()) {
      await tx.contentTypeSetting.upsert({
        where: { type: it.code },
        create: {
          type: it.code,
          isActive: it.isActive,
          showInNav: it.showInNav,
          sortOrder: (i + 1) * 10,
        },
        update: {
          isActive: it.isActive,
          showInNav: it.showInNav,
          sortOrder: (i + 1) * 10,
        },
      });
    }

    /*
     * **무엇이 바뀌었는지만** 적습니다. 여섯 줄을 통째로 남기면 감사 로그에서
     * 「이번에 뭘 건드렸나」를 사람이 다시 비교해야 합니다.
     */
    const changed = normalized.filter((it) => {
      const b = before.find((x) => x.code === it.code);
      return (
        !b || b.isActive !== it.isActive || b.showInNav !== it.showInNav
      );
    });

    await audit.log(
      actor,
      {
        action: "SETTING_UPDATE",
        targetType: "content_type",
        summary:
          changed.length > 0
            ? `콘텐츠 타입 설정 — ${changed.map((c) => c.code).join(", ")}`
            : "콘텐츠 타입 순서 변경",
        diff: {
          order: {
            before: before.map((b) => b.code).join(" > "),
            after: normalized.map((n) => n.code).join(" > "),
          },
          ...Object.fromEntries(
            changed.map((c) => {
              const b = before.find((x) => x.code === c.code);
              return [
                c.code,
                {
                  before: b ? `활성 ${b.isActive} · 메뉴 ${b.showInNav}` : "(기본값)",
                  after: `활성 ${c.isActive} · 메뉴 ${c.showInNav}`,
                },
              ];
            })
          ),
        },
      },
      tx
    );
  });
}
