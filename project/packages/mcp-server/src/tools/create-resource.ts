import { z } from "zod";

import {
  flatten,
  type QueenBeeClient,
  type ResourceArgs,
  type ToolDef,
} from "../client.js";

/**
 * `queenbee_create_resource` — 자료 등록 (`FR-CLI-005`).
 *
 * ## 필드를 여기에 적지 않습니다
 *
 * `detail` 은 **자유 형식**입니다. 타입별 필수·선택 필드는
 * `queenbee_list_content_types` 가 JSON Schema 로 알려 주고, 검증은 서버가
 * 합니다. 여기에 타입별 칸을 나열하면 **타입이 늘 때마다 이 파일이 늙고**,
 * 늙은 것을 알아차릴 방법이 없습니다 (`REQ-04 · 4.9`, `DEV-06 · 6.2`).
 *
 * ## 실패해도 자동으로 다시 부르지 않습니다
 *
 * 등록은 부작용이 있습니다. 조용한 재시도는 **중복 등록**을 만듭니다
 * (`DEV-08 · 8.3`). 검증 실패면 어느 칸이 왜 틀렸는지가 문구에 실려 오므로
 * **고쳐서** 다시 부르십시오 — 같은 것을 그대로 다시 보내지 마십시오.
 *
 * ## 확인 못 한 값은 비워 둡니다
 *
 * 스타 수·라이선스처럼 **서버 워커가 채우는 값**을 추측해 넣으면 자료가
 * 오염됩니다 (`FR-CLI-005` 수용 기준).
 */
export const createResource: ToolDef<ResourceArgs> = {
  name: "queenbee_create_resource",
  title: "자료 등록",
  description:
    "QueenBee 에 자료를 등록한다. 먼저 queenbee_list_content_types 로 타입별 필드를 확인하고, queenbee_check_duplicate 로 중복을 확인한 뒤에 부른다. 중복이면 409 로 거절되며 기존 자료를 알려 준다. 실패해도 같은 내용으로 다시 부르지 말고, 알려 준 문제를 고쳐서 부른다.",
  inputSchema: {
    type: z
      .string()
      .describe("콘텐츠 타입 코드 (queenbee_list_content_types 의 code)"),
    title: z.string().describe("자료 제목"),
    summary: z
      .string()
      .optional()
      .describe("한 문장 요약. 무엇에 대한 자료인지만 적는다"),
    url: z.string().optional().describe("원본 URL"),
    body: z.string().optional().describe("본문 (마크다운)"),
    category: z
      .string()
      .optional()
      .describe("카테고리 slug (queenbee_list_taxonomy 의 값)"),
    tags: z
      .array(z.string())
      .optional()
      .describe("태그 3~5개. 새로 만들기 전에 queenbee_list_taxonomy 를 본다"),
    detail: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        "타입별 상세 필드. queenbee_list_content_types 가 준 detailSchema 를 그대로 따른다"
      ),
  },
  readOnly: false,
  async run(client: QueenBeeClient, args: ResourceArgs) {
    return (await client.post("/resources", flatten(args))).data;
  },
};
