import "server-only";

import { listOperational } from "@/features/resources/content-types/operational";
import { db } from "@/lib/db";
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
