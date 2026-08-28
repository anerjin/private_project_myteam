import type { SearchItem } from "@/components/layout/site-header";
import { getContentType } from "@/features/resources/content-types";
import type { Resource } from "@/types";

/** 커맨드 팔레트(Ctrl+K)에 넣을 후보를 만든다 */
export function toSearchItems(resources: Resource[], limit = 8): SearchItem[] {
  return resources.slice(0, limit).map((r) => {
    const meta = getContentType(r.type);
    return {
      id: r.id,
      title: r.title,
      typeLabel: meta.label,
      keywords: `${r.title} ${r.tags.join(" ")} ${meta.label}`,
      href: `/resources/${meta.slug}/${r.slug}`,
    };
  });
}
