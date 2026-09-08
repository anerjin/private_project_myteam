import type { NeowaveWorkClient, ToolDef } from "../client.js";

/**
 * `nwwork_list_content_types` — 타입 목록 + **타입별 JSON Schema** (`FR-CLI-002`).
 *
 * ## 이 도구가 왜 필요한가
 *
 * 에이전트가 타입별 필수 필드를 모르면 등록이 실패하거나 **빈 자료가 쌓입니다.**
 * 서버가 zod 에서 생성한 JSON Schema 를 그대로 내려주므로, 무엇을 채워야
 * 하는지 에이전트가 스스로 알 수 있습니다.
 *
 * **타입이 늘어도 이 파일을 고치지 않습니다** (`REQ-04 · 4.9`) — 목록도
 * 스키마도 서버가 만듭니다. 여기에 타입 이름을 적어 두면 그 순간부터 늙습니다.
 */
export const listContentTypes: ToolDef = {
  name: "nwwork_list_content_types",
  title: "콘텐츠 타입 목록",
  description:
    "Neowave Work 의 콘텐츠 타입과 타입별 필수/선택 필드 스키마를 조회한다. 자료를 등록하기 전에 반드시 먼저 부른다 — 어떤 타입이 있고 무엇을 채워야 하는지가 여기서만 나온다.",
  inputSchema: {},
  readOnly: true,
  run: async (client: NeowaveWorkClient) =>
    (await client.get("/content-types")).data,
};
