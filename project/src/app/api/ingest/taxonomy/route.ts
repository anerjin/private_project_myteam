import { ingest, json } from "@/app/api/ingest/_lib/handler";
import * as categoryService from "@/server/services/category.service";
import * as resourceService from "@/server/services/resource.service";

/**
 * API-106 카테고리 트리 + 인기 태그 (`FR-CLI-007`).
 *
 * 에이전트가 **있는 분류를 쓰게** 하려고 있습니다. 없는 카테고리 slug 를
 * 보내면 `write` 가 조용히 `null` 을 넣으므로(`P4` 에서 고친 그 자리),
 * 등록 전에 여기서 골라야 합니다.
 *
 * 태그도 같습니다 — 새 태그를 마음대로 만들면 `유사 태그`가 빠르게 늘고
 * (`FR-ADM-013` 이 그 정리를 위해 있습니다) 검색이 갈립니다.
 */
export const GET = ingest("resources:read", async () => {
  const [tree, tags] = await Promise.all([
    categoryService.listTree(),
    resourceService.topTags(50),
  ]);

  return json({
    data: {
      categories: tree.map((c) => ({
        slug: c.slug,
        name: c.name,
        children: c.children.map((s) => ({ slug: s.slug, name: s.name })),
      })),
      tags: tags.map((t) => ({ slug: t.slug, label: t.label, count: t.count })),
    },
  });
});
