import { z } from "zod";

import type { NeowaveWorkClient, ToolDef } from "../client.js";

interface Args {
  id: string;
}

/**
 * `nwwork_archive_github` — 아카이브 작업 요청 (`FR-CLI-008`).
 *
 * **작업만 걸고 바로 돌아옵니다.** 저장소를 내려받는 데 시간이 걸리고,
 * 에이전트가 기다릴 일이 아닙니다. 진행 상황은 Neowave Work 관리 화면의
 * 「작업」에서 봅니다.
 *
 * `archive:run` 스코프가 필요합니다 — `EDITOR` 이상만 가질 수 있습니다
 * (`REQ-02 · 2.2`). 없으면 「권한이 없다」가 아니라 **무엇을 하면 되는지**가
 * 문구로 옵니다.
 */
export const archiveGithub: ToolDef<Args> = {
  name: "nwwork_archive_github",
  title: "아카이브 요청",
  description:
    "GitHub 저장소 자료의 소스 아카이브를 만드는 작업을 요청한다. 작업만 걸고 즉시 돌아오며, 완료를 기다리지 않는다. GITHUB_REPO 타입 자료에만 쓸 수 있고 archive:run 권한이 필요하다.",
  inputSchema: {
    id: z.string().describe("GITHUB_REPO 타입 자료의 id"),
  },
  readOnly: false,
  async run(client: NeowaveWorkClient, args: Args) {
    return (
      await client.post(`/resources/${encodeURIComponent(args.id)}/archive`)
    ).data;
  },
};
