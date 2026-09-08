import { z } from "zod";

import {
  flatten,
  type NeowaveWorkClient,
  type ResourceArgs,
  type ToolDef,
} from "../client.js";

interface Args extends ResourceArgs {
  id: string;
}

/**
 * `nwwork_update_resource` — 자료 보강 (`FR-CLI-006`).
 *
 * ## **보낸 칸만 바뀝니다**
 *
 * 안 보낸 칸은 서버가 지금 값을 읽어 그대로 둡니다. 그러니 **비어 있는 것을
 * 채우는 데** 쓰십시오 — 전체를 다시 보내면 사람이 손으로 고쳐 놓은 것을
 * 덮어씁니다.
 *
 * ## 권한은 서버가 봅니다
 *
 * **`resources:write` 스코프가 있는 키면 고칩니다** — 남이 등록한 자료도
 * 마찬가지입니다. 여기서 미리 판정하지 않습니다 — 규칙이 두 곳에 생깁니다.
 *
 * **타입은 못 바꿉니다.** 상세 테이블이 갈리기 때문입니다. 잘못 등록했다면
 * 새로 등록하고 «대체함» 으로 이어 주십시오.
 */
export const updateResource: ToolDef<Args> = {
  name: "nwwork_update_resource",
  title: "자료 보강",
  description:
    "이미 등록된 자료의 빈 칸을 채운다. 보낸 필드만 바뀌고 나머지는 그대로 남는다. 먼저 nwwork_get_resource 로 지금 값을 확인하고, 비어 있는 것만 보낸다. 타입은 바꿀 수 없다.",
  inputSchema: {
    id: z.string().describe("자료 id"),
    title: z.string().optional(),
    summary: z.string().optional(),
    url: z.string().optional(),
    body: z.string().optional().describe("본문 (마크다운)"),
    category: z.string().optional().describe("카테고리 slug"),
    tags: z.array(z.string()).optional(),
    detail: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("타입별 상세 필드 중 «채울 것만»"),
  },
  readOnly: false,
  async run(client: NeowaveWorkClient, args: Args) {
    const { id, ...rest } = args;
    return (
      await client.patch(`/resources/${encodeURIComponent(id)}`, flatten(rest))
    ).data;
  },
};
