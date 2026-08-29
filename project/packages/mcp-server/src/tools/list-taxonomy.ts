import type { QueenBeeClient, ToolDef } from "../client.js";

/**
 * `queenbee_list_taxonomy` — 카테고리 트리·인기 태그 (`FR-CLI-007`).
 *
 * **새 태그를 만들기 전에 부르십시오.** 「rag」와 「RAG」와 「retrieval-augmented」가
 * 따로 생기면 태그로 찾는 일이 안 됩니다. 카테고리는 **있는 것만** 쓸 수
 * 있습니다 — 없는 slug 를 보내면 등록이 거절됩니다.
 */
export const listTaxonomy: ToolDef = {
  name: "queenbee_list_taxonomy",
  title: "분류 조회",
  description:
    "카테고리 트리와 많이 쓰인 태그를 조회한다. 자료를 분류하기 전에 부른다 — 카테고리는 여기 있는 slug 만 쓸 수 있고, 태그는 새로 만들기 전에 비슷한 것이 있는지 먼저 본다.",
  inputSchema: {},
  readOnly: true,
  run: async (client: QueenBeeClient) => (await client.get("/taxonomy")).data,
};
