import { Library } from "lucide-react";

import type { NavGroup } from "@/config/navigation";
import { getContentType } from "@/features/resources/content-types";
import type { ResourceType } from "@/types";

/**
 * 사이드바의 «자료» 메뉴를 레지스트리에서 만든다. 하드코딩하지 않는다.
 *
 * **노출 여부·순서는 서버가 판정해서 넘깁니다** (`DEC-032`·`FR-ADM-014`) —
 * `content_type_settings` 를 읽는 일은 `server/services/content-type.service.ts`
 * 가 하고, 여기는 **아이콘을 붙여 메뉴 모양으로 바꾸는** 표현 계층입니다.
 * 이 파일이 DB 를 읽으면 `features` 가 `server` 를 알게 됩니다.
 */
export interface NavType {
  code: ResourceType;
  slug: string;
  label: string;
}

export function buildResourceNavGroup(types: NavType[]): NavGroup {
  return {
    label: "자료",
    items: [
      { title: "전체", href: "/resources", icon: Library },
      ...types.map((t) => ({
        title: t.label,
        href: `/resources/${t.slug}`,
        // 아이콘은 «표현»이라 레지스트리가 갖는다 (DEC-032)
        icon: getContentType(t.code).icon,
      })),
    ],
  };
}
