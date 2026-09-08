import { z } from "zod";

import type { NeowaveWorkClient, ToolDef } from "../client.js";

interface Args {
  q?: string;
  type?: string;
  tag?: string;
  category?: string;
  cursor?: string;
}

/**
 * `nwwork_search` — 기존 자료 검색 (`FR-CLI-003`).
 *
 * **등록 전에 부르는 도구입니다.** 「이미 있는가」를 URL 로 묻는 것은
 * `nwwork_check_duplicate` 이고, **주제로** 묻는 것이 이쪽입니다 — 같은
 * 내용을 다른 주소로 쓴 자료는 URL 로는 안 걸립니다.
 *
 * 응답의 `searchTruncated` 가 참이면 **후보 상한에 닿은 것**입니다(`DEC-048`).
 * 그때 「없다」로 판단하면 안 됩니다 — 질의를 좁혀 다시 물어야 합니다.
 */
export const search: ToolDef<Args> = {
  name: "nwwork_search",
  title: "자료 검색",
  description:
    "Neowave Work 에 이미 있는 자료를 키워드·타입·태그·카테고리로 검색한다. 등록하기 전에 비슷한 자료가 있는지 확인할 때 쓴다. searchTruncated 가 true 면 결과가 잘린 것이므로 '없다'고 판단하지 말고 질의를 좁혀 다시 부른다.",
  inputSchema: {
    q: z.string().optional().describe("검색어. 제목·요약·본문에서 찾는다"),
    type: z
      .string()
      .optional()
      .describe(
        "콘텐츠 타입 코드. nwwork_list_content_types 가 알려 주는 값만 쓴다"
      ),
    tag: z.string().optional().describe("태그 slug"),
    category: z.string().optional().describe("카테고리 slug"),
    cursor: z.string().optional().describe("다음 쪽 커서 (meta.nextCursor)"),
  },
  readOnly: true,
  async run(client: NeowaveWorkClient, args: Args) {
    const env = await client.get("/search", {
      q: args.q,
      type: args.type,
      tag: args.tag,
      category: args.category,
      cursor: args.cursor,
    });
    return { results: env.data, ...env.meta };
  },
};
