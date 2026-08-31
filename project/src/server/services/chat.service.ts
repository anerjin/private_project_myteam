import "server-only";

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { ASSISTANT } from "@/features/chat/assistant";
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
 * | `--restricted` | Bash·코드 실행 도구가 사라집니다 |
 * | `--strict-mcp-config` | 이 PC 사용자의 개인 MCP 설정을 무시합니다 |
 * | `--disallowedTools` | 나머지 내장 도구를 **목록에서 지웁니다** |
 * | 키 스코프 `resources:read` | 쓰기 도구를 불러도 API 가 403 을 줍니다 |
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

/**
 * **`--restricted` 만으로는 부족합니다.**
 *
 * `--restricted` 가 없애는 것은 「명령·코드를 **실행**하는」 도구뿐입니다.
 * `WebSearch`·`Read`·`Write`·`Task` 는 그대로 남고, `--allowedTools` 는
 * 「물어보지 않고 허용할 것」 목록이지 **「이것만 있다」가 아닙니다.**
 *
 * `--allowedTools` 만 주고 CLI 에게 물어봤더니(`listTools`) 모델이 이걸 쥐고
 * 있었습니다:
 *
 * > `Task` `Edit` `Glob` `Grep` `Read` `Write` `WebSearch` `SendMessage`
 * > `PushNotification` `Skill` … 그리고 `queenbee_create_resource` ·
 * > `queenbee_update_resource` · `queenbee_archive_github`
 *
 * 그래서 운영자가 「공간정보 저장소를 찾아줘」라고 물었을 때 **사내 자료가
 * 아니라 바깥 저장소 목록**이 나왔습니다. 이 채팅은 **사내 전용**입니다 —
 * 바깥을 뒤질 수 있으면 언젠가 뒤집니다.
 *
 * `--disallowedTools` 는 목록에서 **아예 지웁니다**(측정으로 확인). 남는 것은
 * `ToolSearch` 와 `READ_TOOLS` 다섯뿐입니다.
 *
 * > **이 목록은 낡습니다.** CLI 를 올리면 새 도구가 조용히 늘어납니다.
 * > 그래서 `verify:chat` 이 «막았다»를 믿지 않고 `listTools()` 로 물어봅니다.
 */
const DENIED_TOOLS = [
  // 바깥으로 나가는 것 — 이 채팅이 사내 전용인 이유
  "WebSearch",
  "WebFetch",
  "SendMessage",
  "SendUserFile",
  "PushNotification",
  "Artifact",
  "RemoteTrigger",
  // 이 PC 의 파일
  "Read",
  "Write",
  "Edit",
  "NotebookEdit",
  "Glob",
  "Grep",
  "Bash",
  // 다른 에이전트·작업을 만드는 것
  "Task",
  "Agent",
  "Skill",
  "ListAgents",
  "TaskOutput",
  "TaskStop",
  "CronCreate",
  "CronDelete",
  "CronList",
  "ScheduleWakeup",
  "EnterWorktree",
  "ExitWorktree",
  "DesignSync",
  "ReportFindings",
  // 키 스코프가 이미 막지만, 부르지도 못하게 합니다 (`DEC-047`)
  "mcp__queenbee__queenbee_create_resource",
  "mcp__queenbee__queenbee_update_resource",
  "mcp__queenbee__queenbee_archive_github",
];

/** 모델에게 남아 있어야 하는 것 — `verify:chat` 이 이 집합과 견줍니다 */
export const EXPECTED_TOOLS = ["ToolSearch", ...READ_TOOLS];

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
  /**
   * 앞의 대화를 **이어붙였는가.**
   *
   * `false` 인데 `sessionId` 를 넘겼다면 **그 대화가 사라진 것**입니다 —
   * 말풍선은 브라우저에 남아 있어도 모델은 아무것도 기억하지 못합니다.
   * 화면이 그 사실을 말해야 사용자가 「왜 갑자기 모르지」로 헤매지 않습니다.
   */
  resumed: boolean;
}

/**
 * CLI 가 0 이 아닌 코드로 끝났다.
 *
 * `stderr` 를 **사용자에게 주지 않습니다**(`NFR-SEC-016`) — 경로·설정이 섞여
 * 나옵니다. 다만 «왜 실패했는지»로 갈라야 할 때가 있어 여기까지는 들고 옵니다.
 */
class CliFailure extends Error {
  constructor(
    readonly stderr: string,
    readonly code: number | null
  ) {
    super("claude cli failed");
  }
}

/** 이어붙일 대화가 없어졌을 때 CLI 가 하는 말 */
const GONE = /No conversation found/i;

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
    // 도구가 꺼져 있어도 막습니다 — 그때야말로 바깥으로 나가고 싶어집니다
    "--disallowedTools",
    ...DENIED_TOOLS,
  ];

  if (tools) {
    args.push("--mcp-config", mcpConfig(), "--allowedTools", ...READ_TOOLS);
  }

  const wantsResume = Boolean(sessionId && UUID.test(sessionId));

  await acquire();
  const startedAt = Date.now();
  try {
    /*
     * **이어붙일 대화가 사라졌으면 새로 시작합니다.**
     *
     * 말풍선을 브라우저에 저장하기 시작하면서 `sessionId` 가 **며칠씩**
     * 살아남게 됐습니다. 그런데 CLI 의 대화 기록은 이 PC 의
     * `~/.claude` 에 있고 지워질 수 있습니다 — 그때 CLI 는 exit 1 로
     * 「No conversation found」를 냅니다.
     *
     * 그대로 두면 **한 번 지워진 뒤로 그 사람의 채팅이 영영 안 됩니다.**
     * 여기서 받아 새 대화로 다시 묻고, `resumed: false` 로 알립니다.
     */
    let resumed = wantsResume;
    let raw: string;
    try {
      raw = await run(
        bin,
        wantsResume ? [...args, "--resume", sessionId!] : args,
        message
      );
    } catch (e) {
      if (!(wantsResume && e instanceof CliFailure && GONE.test(e.stderr))) {
        throw asAppError(e);
      }
      resumed = false;
      raw = await run(bin, args, message).catch((e2) => {
        throw asAppError(e2);
      });
    }

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
      reply: toRelativeLinks(parsed.result),
      sessionId: parsed.session_id ?? null,
      ms: Date.now() - startedAt,
      turns: parsed.num_turns ?? 0,
      toolsEnabled: tools,
      resumed,
    };
  } finally {
    release();
  }
}

/** `CliFailure` 는 우리끼리 쓰는 것 — 바깥에는 사용자에게 보여 줄 말만 나갑니다 */
function asAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  if (e instanceof CliFailure) {
    console.error("[chat] CLI 실패", e.code, e.stderr.slice(0, 500));
    return new AppError("UPSTREAM_ERROR", "대답을 받지 못했습니다.");
  }
  return new AppError("UPSTREAM_ERROR", "대답을 받지 못했습니다.");
}

/**
 * 우리 자료를 가리키는 절대 주소를 **상대 경로로** 바꾼다.
 *
 * MCP 검색이 `QUEENBEE_URL`(= `APP_URL`) 로 주소를 만듭니다. 그 값은
 * `http://localhost:3100` 이라서, 사내망 `192.168.0.205` 로 들어온 팀원에게는
 * **자기 PC 를 가리키는 죽은 링크**가 갑니다. 채팅은 언제나 같은 서버 안에서
 * 열리므로 `/resources/…` 로 두면 어느 주소로 들어왔든 맞습니다.
 *
 * 프롬프트로 「상대 경로로 쓰라」고 시킬 수도 있지만, 그건 **부탁**입니다.
 * 여기서 바꾸면 사실이 됩니다.
 */
function toRelativeLinks(text: string): string {
  const origin = env.APP_URL.replace(/\/+$/, "");
  if (!origin) return text;
  return text.split(origin + "/").join("/");
}

/** 검증이 이 규칙을 볼 수 있게 — 링크가 죽는 것은 화면에서만 보입니다 */
export const toRelativeLinksForTest = toRelativeLinks;

/**
 * 모델이 **실제로 쥐고 있는** 도구 목록.
 *
 * 「막았다」를 코드가 주장하지 않고 **CLI 에게 물어봅니다.** `--restricted` 도
 * `--allowedTools` 도 내가 기대한 대로 동작하지 않았고, 그걸 알게 된 방법이
 * 이것입니다.
 *
 * `init` 줄만 읽고 **바로 죽입니다** — 모델에게 아무것도 묻지 않으므로
 * 사용량을 쓰지 않습니다(`-p` 인데 답을 기다리지 않습니다).
 */
export async function listTools(): Promise<string[]> {
  const bin = findBinary();
  if (!bin) throw new AppError("INTERNAL_ERROR", "Claude Code CLI 를 찾지 못했습니다.");

  const tools = toolsConfigured();
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--restricted",
    "--strict-mcp-config",
    "--disallowedTools",
    ...DENIED_TOOLS,
  ];
  if (tools) {
    args.push("--mcp-config", mcpConfig(), "--allowedTools", ...READ_TOOLS);
  }

  return new Promise<string[]>((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: process.cwd(),
      windowsHide: true,
      shell: false,
    });
    let buf = "";
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      fn();
    };
    const timer = setTimeout(
      () => done(() => reject(new AppError("UPSTREAM_ERROR", "도구 목록을 받지 못했습니다."))),
      30_000
    );

    child.stdout.on("data", (d: Buffer) => {
      buf += d.toString("utf8");
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const m = JSON.parse(line) as {
            type?: string;
            subtype?: string;
            tools?: string[];
          };
          if (m.type === "system" && m.subtype === "init") {
            const list = m.tools ?? [];
            done(() => resolve(list));
            return;
          }
        } catch {
          // 부분 줄입니다 — 다음 chunk 에서 이어집니다
        }
      }
    });
    child.on("error", (e) =>
      done(() => reject(new AppError("UPSTREAM_ERROR", `CLI 를 띄우지 못했습니다: ${e.message}`)))
    );
    child.on("close", () =>
      done(() => reject(new AppError("UPSTREAM_ERROR", "CLI 가 도구 목록 없이 끝났습니다.")))
    );

    // 답을 받을 생각이 없지만, stdin 을 닫아야 CLI 가 뜹니다
    child.stdin.write("ping");
    child.stdin.end();
  });
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

/**
 * 검증이 문구를 읽을 수 있게 열어 둡니다.
 *
 * 도구를 막아도 **모델이 아는 것을 늘어놓는 길**은 남아 있고, 그건 프롬프트
 * 로만 막힙니다. 그러니 프롬프트도 검사 대상입니다 — 문구가 조용히 빠지면
 * 채팅은 다시 바깥 이야기를 합니다.
 */
export function systemPromptFor(context: string): string {
  return systemPrompt(context, toolsConfigured());
}

function systemPrompt(context: string, tools: boolean): string {
  return [
    `당신의 이름은 «${ASSISTANT}» 입니다. 사내 자료 시스템 «QueenBee» 의 도우미이고,`,
    "DOI(드론 공간정보) 개발팀이 씁니다. 이름을 물으면 그렇게 답하십시오.",
    "한국어로, 짧고 사실만 답하십시오. 모르면 모른다고 하십시오 — 지어내지 마십시오.",
    "",
    `사용자가 지금 보고 있는 화면: ${context}`,
    "",
    tools
      ? [
          "## 이 시스템 «안에» 있는 것만 답합니다",
          "",
          "자료·저장소·문서를 **찾아 달라**는 말은 언제나 **QueenBee 에 등록된 자료**를",
          "뜻합니다. 반드시 `queenbee_search` 로 찾고 **검색 결과에 있는 것만** 말하십시오.",
          "",
          "- 당신이 알고 있는 **바깥 저장소·라이브러리를 목록으로 내놓지 마십시오.**",
          "  이 채팅은 사내 전용입니다. 바깥 정보는 사용자가 다른 데서 찾습니다.",
          "- 찾은 것이 없으면 **「등록된 자료가 없습니다」**라고 그대로 말하고 다른",
          "  검색어를 제안하십시오. **빈손을 바깥 지식으로 채우지 마십시오.**",
          "- 한 번 찾아 안 나오면 다른 낱말로 두어 번 더 찾아보십시오",
          "  (예: 「공간정보」·「GIS」·「좌표계」). 그래도 없으면 없다고 하십시오.",
          "- 찾은 자료는 **하나도 빠짐없이 링크로** 주십시오 —",
          "  `- [제목](검색 결과가 준 주소) — 한 줄 설명` 형태입니다.",
          "  제목만 늘어놓으면 사용자가 그 자료로 갈 수가 없습니다.",
          "- 주소는 **검색 결과가 준 것**을 그대로 쓰고, 지어내지 마십시오.",
          "",
          "## 자료를 등록해 달라고 하면",
          "",
          "**당신에게 등록 도구는 없습니다.** 대신 아래 블록을 답 끝에 붙이면",
          "**시스템이 사용자 본인 이름으로 등록합니다.** 블록은 하나만 씁니다.",
          "",
          "위의 「안에 있는 것만」은 **«찾기» 규칙**입니다. 등록은 바깥 자료를",
          "들여오는 일이니 사용자가 말한 것으로 합니다 — 다만 **주소가 확실하지",
          "않으면 지어내지 말고 물어보십시오.** 틀린 주소는 그대로 저장됩니다.",
          "",
          "붙이기 전에 반드시 이 순서를 밟으십시오:",
          "1. `queenbee_check_duplicate` — 이미 있으면 등록하지 말고 그 자료를 알려 주십시오",
          "2. `queenbee_list_content_types` — 타입별 **필수 항목**을 확인하십시오",
          "3. `queenbee_list_taxonomy` — `category` 는 **거기 있는 slug** 중에서만 고르십시오",
          "",
          "```queenbee-register",
          '{ "type": "GITHUB_REPO", "title": "...", "summary": "...", "url": "https://...",',
          '  "category": "gis", "tags": ["태그1","태그2"] }',
          "```",
          "",
          "- `title` 은 **「이름 — 무엇인지 한 줄」**로 지으십시오",
          "  (예: 「GDAL — 래스터·벡터 변환의 사실상 표준」).",
          "  이름만 적으면 목록에서 그것이 무엇인지 아무도 알 수 없습니다.",
          "- `summary` 는 「무엇인지」가 아니라 **「왜 우리 팀이 볼 만한지」**를 한국어 한두 문장으로",
          "- 확인하지 못한 값은 **넣지 마십시오.** 지어낸 값이 그대로 저장됩니다",
          "- 타입마다 필수 항목이 다릅니다(예: `MCP_SERVER` 는 `transport`·`configJson`)",
          "- 본문에 블록을 붙였으면 「등록했습니다」라고 미리 말하지 마십시오 —",
          "  실제로 넣는 것은 시스템이고, 결과는 사용자 화면에 따로 표시됩니다",
        ].join("\n")
      : [
          "지금은 자료 검색 도구가 꺼져 있습니다. 자료를 묻거든 «검색 도구가",
          "설정되지 않았다»고 말하십시오. **바깥에서 찾아 대신 답하지 마십시오** —",
          "이 채팅은 사내 전용이고, 바깥 목록은 사내 자료가 아닙니다.",
        ].join("\n"),
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
         * 경로·설정이 섞여 나옵니다. 부르는 쪽이 «왜 실패했는지»로 갈라야
         * 해서 여기까지만 들고 가고, 로그도 거기서 남깁니다.
         */
        reject(new CliFailure(err, code));
        return;
      }
      resolve(out);
    });

    child.stdin.write(stdin);
    child.stdin.end();
  });
}
