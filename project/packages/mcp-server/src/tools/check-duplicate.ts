import { z } from "zod";

import type { QueenBeeClient, ToolDef } from "../client.js";

interface Args {
  url: string;
}

/**
 * `queenbee_check_duplicate` — URL 정규화 후 중복 확인 (`FR-CLI-004`).
 *
 * ## 중복은 **오류가 아니라 정보**입니다
 *
 * 등록할지 말지는 에이전트·사람이 판단합니다. 그래서 이 도구는 중복이어도
 * 실패하지 않고 기존 자료를 돌려줍니다.
 *
 * ## 등록 «전에» 부르십시오
 *
 * `queenbee_create_resource` 는 중복을 **거절**합니다(`DEC-047`). 20개를
 * 루프로 밀어 넣기 전에 여기서 걸러내면 거절이 아니라 **건너뛰기**가 됩니다.
 *
 * 정규화는 서버가 합니다 — `www.`·추적 파라미터·끝 슬래시를 걷고 GitHub
 * 주소는 `owner/repo` 까지 접습니다. `normalizedUrl` 이 함께 오므로 **왜 같은
 * 것으로 봤는지** 사람에게 보여줄 수 있습니다.
 */
export const checkDuplicate: ToolDef<Args> = {
  name: "queenbee_check_duplicate",
  title: "중복 확인",
  description:
    "URL 을 정규화해 이미 등록된 자료인지 확인한다. 자료를 등록하기 전에 반드시 먼저 부른다. 중복이어도 오류가 아니며, 기존 자료 정보를 돌려준다 — 건너뛸지 보강할지는 판단해서 정한다.",
  inputSchema: {
    url: z.string().describe("확인할 원본 URL"),
  },
  readOnly: true,
  async run(client: QueenBeeClient, args: Args) {
    return (await client.get("/duplicate", { url: args.url })).data;
  },
};
