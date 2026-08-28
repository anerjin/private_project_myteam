import { Library } from "lucide-react";

import type { NavGroup } from "@/config/navigation";
import { listContentTypes } from "@/features/resources/content-types";

/**
 * 사이드바의 «자료» 메뉴를 레지스트리에서 만든다. 하드코딩하지 않는다.
 * 실제 구현에서는 `content_type_settings`(show_in_nav, sort_order)를 읽는다.
 * — DEV-04 · 4.3절
 */
export function buildResourceNavGroup(): NavGroup {
  return {
    label: "자료",
    items: [
      { title: "전체", href: "/resources", icon: Library },
      ...listContentTypes()
        .filter((t) => t.showInNav)
        .map((t) => ({
          title: t.label,
          href: `/resources/${t.slug}`,
          icon: t.icon,
        })),
    ],
  };
}
