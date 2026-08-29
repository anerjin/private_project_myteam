import { ingest, json } from "@/app/api/ingest/_lib/handler";
import { resourceRef } from "@/app/api/ingest/_lib/ref";
import { parseListQuery } from "@/features/resources/list.schema";
import * as resourceService from "@/server/services/resource.service";

/**
 * API-101 자료 검색 (`FR-CLI-003`).
 *
 * ## 웹 목록과 **같은 파서·같은 service** 를 씁니다
 *
 * `parseListQuery` 가 `q`·`type`·`tag`·`category`·`author`·`sort` 를 그대로
 * 받습니다 — 에이전트가 쓸 질의 파라미터를 따로 정의하면 **정렬 허용 표가
 * 두 번 해석**되고, `DEC-045` 가 세운 단일 출처가 깨집니다.
 *
 * ## 에이전트에게는 **가벼운 모양**으로 돌려줍니다
 *
 * 상세 6종을 다 실어 보내면 페이로드가 커지고, 「이미 있는가」를 묻는
 * 단계에서는 제목·타입·주소면 충분합니다. 상세가 필요하면 `API-102` 입니다.
 */
export const GET = ingest("resources:read", async ({ actor, url }) => {
  const query = parseListQuery(Object.fromEntries(url.searchParams));
  const page = await resourceService.list(
    query,
    { kind: "cursor", after: query.cursor, size: 20 },
    actor.id
  );

  return json({
    data: page.items.map((r) => ({
      ...resourceRef(r),
      summary: r.summary,
      /** 원본 링크. 위 `url` 은 **QueenBee 안의 주소**입니다 — 둘은 다른 것입니다 */
      sourceUrl: r.url,
      tags: r.tags,
      author: r.author.username,
      createdAt: r.createdAt,
    })),
    meta: {
      nextCursor: page.nextCursor,
      /*
       * **잘렸으면 말합니다** (`DEC-048`). 에이전트가 「없다」와
       * 「안 보여준다」를 구별해야 중복을 안 만듭니다.
       */
      searchTruncated: page.searchTruncated ?? false,
    },
  });
});
