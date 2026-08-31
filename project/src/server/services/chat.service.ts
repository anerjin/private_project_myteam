import "server-only";

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

/**
 * 도우미 채팅 — **이 PC 의 Claude Code CLI 를 헤드리스로 부릅니다.**
 *
 * ## 왜 API 가 아니라 CLI 인가
 *
 * 운영자가 Claude Max 를 구독하고 있고 CLI 가 이미 그 자격으로 로그인해
 * 있습니다(`claude auth status` → `authMethod: claude.ai`). 그래서 **앱이
 * 모델 API 키를 갖지 않습니다** — 키를 두지 않으면 새지도 않습니다.
 *
 * 대가는 두 가지입니다:
 * - 모델 호출이 **이 PC 계정 하나의 사용량 한도**를 씁니다. 팀 전체가 씁니다.
 * - 서버를 다른 Windows 사용자로 돌리면 CLI 의 로그인을 못 읽어 채팅이 죽습니다.
 *
 * ## 무엇을 못 하게 막았는가
 *
 * | 장치 | 막는 것 |
 * | --- | --- |
 * | `--restricted` | Bash·코드 실행 도구 자체가 사라집니다 |
 * | `--strict-mcp-config` | 이 PC 사용자의 개인 MCP 설정을 무시합니다 |
 * | `--allowedTools` (읽기만) | 자료를 **고치거나 지우지 못합니다** |
 * | 프롬프트를 stdin 으로 | 사용자가 친 말이 명령줄에 실리지 않습니다 |
 *
 * **쓰기는 여기서 하지 않습니다.** 등록은 화면이 확인을 받아 우리 액션이
 * 본인 이름으로 만듭니다 — 대화 한 줄로 자료가 생기면 작성자도 틀리고
 * 되돌릴 자리도 없습니다.
 */

/** 읽기 도구만. `create`·`update`·`archive` 는 **일부러 뺐습니다** */
const READ_TOOLS = [
  "mcp__queenbee__queenbee_search",
  "mcp__queenbee__queenbee_get_resource",
  "mcp__queenbee__queenbee_list_taxonomy",
  "mcp__queenbee__queenbee_list_content_types",
  "mcp__queenbee__queenbee_check_duplicate",
];

/** 한 번에 이만큼만 띄웁니다 — 20명이 동시에 물으면 프로세스가 20개 뜹니다 */
const MAX_CONCURRENT = 2;
/** 이만큼 넘으면 죽입니다. 도구를 쓰는 답이 6~20초라 넉넉히 잡았습니다 */
const TIMEOUT_MS = 120_000;

let running = 0;
const waiting: (() => void)[] = [];

async function acquire(): Promise<void> {
  if (running < MAX_CONCURRENT) {
    running += 1;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  running += 1;
}

function release(): void {
  running -= 1;
  waiting.shift()?.();
}

/**
 * CLI 실행 파일을 찾는다.
 *
 * npm 전역 설치의 `claude` 는 Windows 에서 `.ps1`·`.cmd` 껍데기지만, 실제
 * 알맹이는 **`bin/claude.exe`** 입니다. 그것을 직접 띄우면 셸을 거치지 않아도
 * 되고, 셸을 안 거치면 **인용부호 문제도 주입 위험도 없습니다.**
 */
function findBinary(): string | null {
  const candidates = [
    env.CLAUDE_BIN,
    // npm 전역 (Windows): node.exe 옆에 node_modules 가 있습니다
    path.join(
      path.dirname(process.execPath),
      "node_modules/@anthropic-ai/claude-code/bin/claude.exe"
    ),
    // npm 전역 (POSIX)
    path.join(
      path.dirname(process.execPath),
      "../lib/node_modules/@anthropic-ai/claude-code/bin/claude"
    ),
  ].filter((p): p is string => Boolean(p));

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

/** 세션 id 는 CLI 가 준 UUID 입니다. 그 모양이 아니면 안 넘깁니다 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ChatReply {
  reply: string;
  sessionId: string | null;
  ms: number;
  turns: number;
  /** 도구를 쓸 수 있었는가 — 못 썼으면 화면이 그 사실을 말합니다 */
  toolsEnabled: boolean;
}

export function isAvailable(): boolean {
  return findBinary() !== null;
}

export function toolsConfigured(): boolean {
  return Boolean(env.CHAT_API_KEY);
}

/**
 * 한 번 묻고 한 번 답받는다.
 *
 * @param message 사용자가 친 말 — **stdin 으로** 넘어갑니다
 * @param context 지금 보고 있는 화면 설명 (`features/chat/page-context`)
 * @param sessionId 이어서 물을 때. CLI 가 준 값만 받습니다
 */
export async function ask(
  message: string,
  context: string,
  sessionId?: string
): Promise<ChatReply> {
  const bin = findBinary();
  if (!bin) {
    // 우리 쪽 설정 문제입니다 — 바깥이 죽은 것이 아닙니다
    throw new AppError(
      "INTERNAL_ERROR",
      "Claude Code CLI 를 찾지 못했습니다. 설치되어 있는지 확인하거나 .env 에 CLAUDE_BIN 을 지정하십시오."
    );
  }

  const tools = toolsConfigured();
  const args = [
    "-p",
    "--output-format",
    "json",
    // Bash·코드 실행 도구를 통째로 없앱니다
    "--restricted",
    // 이 PC 사용자의 개인 MCP 설정을 쓰지 않습니다
    "--strict-mcp-config",
    "--append-system-prompt",
    systemPrompt(context, tools),
  ];

  if (tools) {
    args.push("--mcp-config", mcpConfig(), "--allowedTools", ...READ_TOOLS);
  }
  if (sessionId && UUID.test(sessionId)) {
    args.push("--resume", sessionId);
  }

  await acquire();
  const startedAt = Date.now();
  try {
    const raw = await run(bin, args, message);
    const parsed = JSON.parse(raw) as {
      type?: string;
      subtype?: string;
      is_error?: boolean;
      result?: string;
      session_id?: string;
      num_turns?: number;
    };

    if (parsed.is_error || typeof parsed.result !== "string") {
      // 바깥 프로세스가 답을 못 준 것입니다 (`UPSTREAM_ERROR` = 502)
      throw new AppError(
        "UPSTREAM_ERROR",
        `대답을 받지 못했습니다 (${parsed.subtype ?? "알 수 없는 실패"}).`
      );
    }

    return {
      reply: parsed.result,
      sessionId: parsed.session_id ?? null,
      ms: Date.now() - startedAt,
      turns: parsed.num_turns ?? 0,
      toolsEnabled: tools,
    };
  } finally {
    release();
  }
}

/**
 * MCP 설정을 **문자열로** 넘깁니다.
 *
 * 파일로 쓰면 그 파일에 API 키가 디스크에 남습니다. CLI 가 JSON 문자열도
 * 받으므로(`--mcp-config <configs...>`) 그냥 넘깁니다 — 셸을 안 거치니
 * 따옴표가 깨질 일도 없습니다.
 */
function mcpConfig(): string {
  const entry = path.join(
    process.cwd(),
    "packages/mcp-server/dist/index.js"
  );
  return JSON.stringify({
    mcpServers: {
      queenbee: {
        command: process.execPath,
        args: [entry],
        env: {
          QUEENBEE_URL: env.APP_URL,
          QUEENBEE_API_KEY: env.CHAT_API_KEY,
        },
      },
    },
  });
}

function systemPrompt(context: string, tools: boolean): string {
  return [
    "당신은 사내 자료 시스템 «QueenBee» 의 도우미입니다. DOI(드론 공간정보) 개발팀이 씁니다.",
    "한국어로, 짧고 사실만 답하십시오. 모르면 모른다고 하십시오 — 지어내지 마십시오.",
    "",
    `사용자가 지금 보고 있는 화면: ${context}`,
    "",
    tools
      ? [
          "queenbee 도구로 자료를 **찾아볼 수 있습니다**. 자료를 묻거든 먼저 검색하십시오.",
          "자료를 가리킬 때는 제목을 그대로 쓰십시오. 링크 주소를 지어내지 마십시오.",
          "",
          "**자료를 등록·수정·삭제하는 도구는 없습니다.** 사용자가 등록을 원하면",
          "무엇을 등록할지 정리해 주고, 화면의 「등록」 버튼을 누르라고 안내하십시오.",
        ].join("\n")
      : "지금은 자료 검색 도구가 꺼져 있습니다. 자료를 묻거든 «검색 도구가 설정되지 않았다»고 말하십시오.",
  ].join("\n");
}

function run(bin: string, args: string[], stdin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    /*
     * **`cwd` 를 프로젝트로 둡니다.** CLI 가 작업 디렉터리를 기준으로
     * 권한과 설정을 잡습니다. `--restricted` 라 파일 도구도 여기 갇힙니다.
     */
    const child = spawn(bin, args, {
      cwd: process.cwd(),
      windowsHide: true,
      // 셸을 거치지 않습니다 — 인용부호도 주입도 없습니다
      shell: false,
    });

    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new AppError("UPSTREAM_ERROR", "대답이 너무 오래 걸려 중단했습니다."));
    }, TIMEOUT_MS);

    child.stdout.on("data", (d: Buffer) => (out += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (err += d.toString("utf8")));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new AppError("UPSTREAM_ERROR", `CLI 를 띄우지 못했습니다: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        /*
         * **stderr 를 그대로 사용자에게 주지 않습니다** (`NFR-SEC-016`).
         * 경로·설정이 섞여 나옵니다. 서버 로그에만 남깁니다.
         */
        console.error("[chat] CLI 실패", code, err.slice(0, 500));
        reject(new AppError("UPSTREAM_ERROR", "대답을 받지 못했습니다."));
        return;
      }
      resolve(out);
    });

    child.stdin.write(stdin);
    child.stdin.end();
  });
}
