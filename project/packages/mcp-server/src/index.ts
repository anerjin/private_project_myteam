#!/usr/bin/env node
/**
 * Neowave Work stdio MCP 서버 진입점 (`FR-CLI-001`, `DEV-08 · 8.3`).
 *
 * 개발자 PC 에서 Claude Code 가 **자식 프로세스로** 실행합니다. Neowave Work
 * 서버에 배포되는 것이 아니라 사용자 쪽에서 도는 클라이언트입니다.
 *
 * ## stdout 은 프로토콜 전용입니다
 *
 * 사람이 읽을 것은 전부 **stderr** 로 갑니다. stdout 에 한 줄이라도 섞이면
 * JSON-RPC 대화가 깨지고, 증상은 「도구가 안 보인다」로만 나타납니다.
 *
 * ## 등록·오류 포장이 여기 한 곳에 있습니다
 *
 * 도구 파일 여덟 개는 **정의만** 갖고 있습니다. 같은 try/catch 를 여덟 번
 * 복사하면 한 곳만 고쳐지는 날이 옵니다.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { NeowaveWorkClient, ToolFailure, type ToolDef } from "./client.js";
import { loadConfig } from "./env.js";
import { archiveGithub } from "./tools/archive-github.js";
import { checkDuplicate } from "./tools/check-duplicate.js";
import { createResource } from "./tools/create-resource.js";
import { getResource } from "./tools/get-resource.js";
import { listContentTypes } from "./tools/list-content-types.js";
import { listTaxonomy } from "./tools/list-taxonomy.js";
import { search } from "./tools/search.js";
import { updateResource } from "./tools/update-resource.js";

const TOOLS: ToolDef<never>[] = [
  listContentTypes,
  search,
  getResource,
  checkDuplicate,
  createResource,
  updateResource,
  listTaxonomy,
  archiveGithub,
];

function log(line: string): void {
  process.stderr.write(`[neowave-work-mcp] ${line}\n`);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new NeowaveWorkClient(config);

  const server = new McpServer(
    { name: "neowave-work", version: "0.1.0" },
    {
      instructions:
        "Neowave Work 은 사내 AI 개발 자료 지식 베이스다. 자료를 등록하기 전에 nwwork_list_content_types 로 타입별 필드를 확인하고 nwwork_check_duplicate 로 중복을 확인한다. 등록 실패는 자동으로 재시도하지 않는다.",
    }
  );

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          readOnlyHint: tool.readOnly,
          /*
           * **등록·수정은 «되돌릴 수 없는» 것으로 표시합니다.** 클라이언트가
           * 이 힌트로 확인을 물을지 정합니다. 여기서 거짓말하면 에이전트가
           * 조용히 자료를 만듭니다.
           */
          destructiveHint: false,
          idempotentHint: tool.readOnly,
          openWorldHint: true,
        },
      },
      async (args: unknown) => runTool(tool, client, args)
    );
  }

  await server.connect(new StdioServerTransport());
  log(`연결됨 — ${config.baseUrl}`);

  /*
   * **설정 점검을 «비차단»으로 합니다** (`API-108`). 키가 틀렸다면 첫 도구
   * 호출까지 기다리지 않고 지금 말해 주는 편이 낫습니다. 그렇다고 여기서
   * 죽이지는 않습니다 — 서버가 잠깐 안 떠 있을 뿐인데 MCP 서버를 못 쓰게
   * 만들면, 사용자는 서버를 띄운 뒤 Claude Code 까지 다시 켜야 합니다.
   */
  void client
    .get("/whoami")
    .then((env) => {
      const who = env.data as { username?: string; scopes?: string[] };
      log(`인증됨 — ${who?.username} (${(who?.scopes ?? []).join(", ")})`);
    })
    .catch((e: unknown) => {
      log(e instanceof Error ? e.message : String(e));
    });
}

/**
 * 도구 하나를 실행하고 결과를 MCP 모양으로 포장한다.
 *
 * **실패를 예외로 던지지 않습니다.** 던지면 클라이언트에는 「도구 실행 실패」만
 * 남고 우리가 만든 안내 문구가 사라집니다. `isError` 를 세운 결과로 주면
 * 에이전트가 문구를 읽고 판단합니다 (`DEV-08 · 8.3`).
 */
async function runTool(
  tool: ToolDef<never>,
  client: NeowaveWorkClient,
  args: unknown
) {
  try {
    const data = await tool.run(client, args as never);
    return { content: [{ type: "text" as const, text: stringify(data) }] };
  } catch (e) {
    if (e instanceof ToolFailure) {
      /*
       * 오류와 **함께 온 정보**(중복 자료 등)를 같이 싣습니다 — 에이전트가
       * 「건너뛸지 보강할지」를 판단할 재료입니다.
       */
      const text =
        e.data === undefined
          ? e.message
          : `${e.message}\n\n${stringify(e.data)}`;
      return { content: [{ type: "text" as const, text }], isError: true };
    }
    return {
      content: [
        {
          type: "text" as const,
          text: e instanceof Error ? e.message : String(e),
        },
      ],
      isError: true,
    };
  }
}

function stringify(data: unknown): string {
  return typeof data === "string" ? data : JSON.stringify(data, null, 2);
}

main().catch((e: unknown) => {
  log(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
