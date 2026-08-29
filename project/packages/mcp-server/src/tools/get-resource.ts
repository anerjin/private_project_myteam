import { z } from "zod";

import type { QueenBeeClient, ToolDef } from "../client.js";

interface Args {
  id: string;
}

/**
 * `queenbee_get_resource` — 자료 상세 (`API-102`).
 *
 * 검색 결과는 가벼운 모양이라 타입별 상세가 없습니다. **보강하기 전에**
 * 지금 무엇이 채워져 있는지 보려면 이것을 부릅니다 — 안 보고 고치면
 * 이미 있는 값을 덮어씁니다.
 */
export const getResource: ToolDef<Args> = {
  name: "queenbee_get_resource",
  title: "자료 상세",
  description:
    "자료 하나의 상세를 타입별 필드까지 조회한다. 보강(queenbee_update_resource) 하기 전에 먼저 불러 지금 채워진 값을 확인한다.",
  inputSchema: {
    id: z.string().describe("자료 id (검색·등록 응답의 id)"),
  },
  readOnly: true,
  async run(client: QueenBeeClient, args: Args) {
    return (await client.get(`/resources/${encodeURIComponent(args.id)}`)).data;
  },
};
