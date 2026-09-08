/**
 * `P7` 검증 (2) — **MCP 서버를 stdio 로 띄워** 도구를 부른다 (`FR-CLI-001`).
 *
 *   npm run verify:p7-mcp   (`npm run dev` 가 떠 있어야 합니다)
 *
 * ## 왜 함수를 직접 안 부르는가
 *
 * `client.get()` 을 부르면 **MCP 프로토콜을 통과하지 않습니다** — 도구가
 * 등록됐는지, 스키마가 유효한지, 오류가 `isError` 로 나가는지, stdout 이
 * 깨끗한지가 전부 빠집니다. 그리고 Claude Code 가 겪는 것은 그 전부입니다.
 * `P6` 에서 「service 를 직접 부른 것은 화면 검증이 아니다」가 세 페이즈 묵은
 * 결함을 잡은 것과 같은 이유입니다.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";

import { db } from "@/lib/db";
import { hashPassword } from "@/server/auth/password";
import * as apiKeyService from "@/server/services/api-key.service";

const SERVER = path.join(
  process.cwd(),
  "packages",
  "mcp-server",
  "dist",
  "index.js"
);

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(
    `${ok ? "  OK  " : "  실패"} ${label}${detail ? " — " + detail : ""}`
  );
  if (ok) pass++;
  else fail++;
}

const madeUsers: string[] = [];
const madeResources: string[] = [];

async function mkUser(tag: string) {
  const u = await db.user.create({
    data: {
      username: `vp7m_${tag}_${randomBytes(4).toString("hex")}`,
      passwordHash: await hashPassword("Verify!12345"),
      name: `P7MCP-${tag}`,
      status: "ACTIVE",
    },
    select: { id: true, username: true },
  });
  madeUsers.push(u.id);
  return u;
}

/* ── 최소 JSON-RPC 클라이언트 ────────────────────────────────────────────
 * SDK 클라이언트를 쓰지 않고 직접 말합니다. **우리 서버가 프로토콜을 지키는지**
 * 를 보려는 것이라, 같은 SDK 가 양쪽에서 어긋남을 덮어 주면 안 됩니다. */

interface Rpc {
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

class Stdio {
  private buf = "";
  private next = 1;
  private waiting = new Map<number, (r: Rpc) => void>();
  /** **stdout 에 섞인 것**을 잡아 두는 자리 — 프로토콜 밖 출력은 곧 고장입니다 */
  readonly junk: string[] = [];
  readonly stderr: string[] = [];

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.onData(chunk));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (c: string) => this.stderr.push(c));
  }

  private onData(chunk: string) {
    this.buf += chunk;
    let nl: number;
    while ((nl = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as Rpc;
        const done = this.waiting.get(msg.id);
        if (done) {
          this.waiting.delete(msg.id);
          done(msg);
        }
      } catch {
        this.junk.push(line);
      }
    }
  }

  send(method: string, params: unknown): Promise<Rpc> {
    const id = this.next++;
    const p = new Promise<Rpc>((resolve, reject) => {
      this.waiting.set(id, resolve);
      setTimeout(() => reject(new Error(`${method} 응답 없음`)), 20_000);
    });
    this.child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"
    );
    return p;
  }

  notify(method: string, params: unknown) {
    this.child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n"
    );
  }

  kill() {
    this.child.kill();
  }
}

interface ToolResult {
  content: { type: string; text: string }[];
  isError?: boolean;
}

async function start(env: Record<string, string>) {
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, ...env },
    stdio: ["pipe", "pipe", "pipe"],
  }) as ChildProcessWithoutNullStreams;
  const rpc = new Stdio(child);
  const init = await rpc.send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "verify-p7-mcp", version: "0" },
  });
  rpc.notify("notifications/initialized", {});
  return { rpc, init, child };
}

async function callTool(
  rpc: Stdio,
  name: string,
  args: unknown
): Promise<ToolResult> {
  const r = await rpc.send("tools/call", { name, arguments: args });
  return r.result as ToolResult;
}

function parse(res: ToolResult): unknown {
  const text = res.content?.[0]?.text ?? "";
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function run() {
  const author = await mkUser("author");
  const issued = await apiKeyService.issue(
    { id: author.id, username: author.username, via: "WEB" },
    "P7 MCP 검증",
    ["resources:read", "resources:write", "archive:run"]
  );

  console.log("\n★ 설정이 틀리면 «기동할 때» 죽는다 (DEV-06 · 6.2)");
  {
    const child = spawn(process.execPath, [SERVER], {
      env: { ...process.env, NEOWAVE_WORK_URL: "", NEOWAVE_WORK_API_KEY: "" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let err = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (c: string) => (err += c));
    const code = await new Promise<number>((r) =>
      child.on("exit", (c) => r(c ?? -1))
    );
    check("키가 없으면 종료한다", code === 1, `exit ${code}`);
    check(
      "무엇을 고쳐야 하는지 stderr 로 말한다",
      err.includes("NEOWAVE_WORK_URL") && err.includes("마이페이지"),
      err.split("\n")[0] ?? ""
    );
  }

  const { rpc, init } = await start({
    NEOWAVE_WORK_URL: "http://localhost:3100",
    NEOWAVE_WORK_API_KEY: issued.plaintext,
  });

  try {
    console.log("\n★ 도구 8종이 보인다 (M3 DoD)");
    const listed = await rpc.send("tools/list", {});
    const tools = (listed.result as { tools: { name: string }[] }).tools;
    const names = tools.map((t) => t.name).sort();
    check("여덟 개다", tools.length === 8, `${tools.length}개`);
    check(
      "DEV-08 표의 이름 그대로다",
      JSON.stringify(names) ===
        JSON.stringify(
          [
            "nwwork_archive_github",
            "nwwork_check_duplicate",
            "nwwork_create_resource",
            "nwwork_get_resource",
            "nwwork_list_content_types",
            "nwwork_list_taxonomy",
            "nwwork_search",
            "nwwork_update_resource",
          ].sort()
        ),
      names.join(" ")
    );
    check(
      "서버 이름이 neowave-work 다",
      (init.result as { serverInfo: { name: string } }).serverInfo.name ===
        "neowave-work"
    );

    console.log("\n★ 타입 스키마가 서버에서 온다 (FR-CLI-002)");
    {
      const res = await callTool(rpc, "nwwork_list_content_types", {});
      const types = parse(res) as { code: string; detailSchema: unknown }[];
      check("오류가 아니다", !res.isError);
      check("여섯 타입", types.length === 6, `${types.length}종`);
      check("JSON Schema 가 실려 있다", Boolean(types[0]?.detailSchema));
    }

    console.log("\n★ 한 마디로 자료가 등록된다 (M3 DoD · FR-CLI-005)");
    let createdId = "";
    {
      /*
       * **도구 입력은 `detail` 이 나뉜 모양입니다** (`DEV-08 · 8.3` 입출력 예시).
       * 서버는 평평한 본문을 받으므로 `client.flatten` 이 한 곳에서 번역합니다.
       */
      const res = await callTool(rpc, "nwwork_create_resource", {
        type: "AI_MATERIAL",
        title: "MCP 로 등록한 자료",
        summary: "도구 호출 한 번으로 들어왔다",
        url: "https://example.com/p7-mcp-verify",
        tags: ["mcp", "검증"],
        detail: {
          materialKind: "ARTICLE",
          sourceName: "Example",
          applicability: "수집 파이프라인 점검에 쓴다",
        },
      });
      check("오류가 아니다", !res.isError, res.content?.[0]?.text ?? "");
      const data = parse(res) as { id: string; url: string };
      createdId = data.id;
      madeResources.push(data.id);
      check("자료 URL 을 돌려준다", data.url?.startsWith("http"), data.url);

      const row = await db.resource.findUniqueOrThrow({
        where: { id: data.id },
        select: { sourceChannel: true, title: true },
      });
      check("source_channel = MCP", row.sourceChannel === "MCP");

      const detail = await db.aiMaterial.findUnique({
        where: { resourceId: data.id },
      });
      check(
        "중첩된 detail 이 상세 테이블까지 간다",
        detail?.sourceName === "Example",
        detail?.sourceName ?? ""
      );
      const tags = await db.resourceTag.count({
        where: { resourceId: data.id },
      });
      check("배열로 준 태그가 두 개 붙는다", tags === 2, `${tags}개`);
    }

    console.log("\n★ 중복 URL 은 등록되지 않고 기존 자료를 안내한다 (M3 DoD)");
    {
      const dup = await callTool(rpc, "nwwork_check_duplicate", {
        url: "https://example.com/p7-mcp-verify?utm_source=x",
      });
      const d = parse(dup) as { duplicate: { id: string } | null };
      check("중복 확인은 오류가 아니다", !dup.isError);
      check(
        "추적 파라미터를 걷고 같은 것으로 본다",
        d.duplicate?.id === createdId
      );

      const again = await callTool(rpc, "nwwork_create_resource", {
        type: "AI_MATERIAL",
        title: "같은 URL 두 번째",
        url: "https://example.com/p7-mcp-verify",
        detail: { materialKind: "ARTICLE" },
      });
      check("등록은 isError 로 거절된다", again.isError === true);
      const text = again.content?.[0]?.text ?? "";
      check(
        "무엇과 겹쳤는지 문구로 말한다",
        text.includes("MCP 로 등록한 자료")
      );
      /*
       * **문구뿐 아니라 «자료»가 실려 옵니다** — 에이전트가 문장을 파싱하지
       * 않고도 건너뛸지 보강할지 정할 수 있어야 합니다.
       */
      check(
        "기존 자료가 구조로도 실려 온다",
        text.includes(createdId) && text.includes('"duplicate"'),
        ""
      );
    }

    console.log("\n★ 검증 실패는 «고칠 수 있게» 돌려준다 (FR-CLI-005)");
    {
      const res = await callTool(rpc, "nwwork_create_resource", {
        type: "SKILL",
        title: "필수 빠짐",
      });
      check("isError 다", res.isError === true);
      const text = res.content?.[0]?.text ?? "";
      check(
        "어느 칸이 문제인지 말한다",
        text.includes("skillName"),
        text.slice(0, 90)
      );
    }

    console.log("\n★ 보강 — 보낸 칸만 바뀐다 (FR-CLI-006)");
    {
      const res = await callTool(rpc, "nwwork_update_resource", {
        id: createdId,
        detail: { keyPoints: "- MCP 로 채운 요점" },
      });
      check("오류가 아니다", !res.isError, res.content?.[0]?.text ?? "");
      const detail = await db.aiMaterial.findUniqueOrThrow({
        where: { resourceId: createdId },
      });
      check("보낸 칸이 들어간다", detail.keyPoints === "- MCP 로 채운 요점");
      check("안 보낸 칸은 그대로다", detail.sourceName === "Example");
    }

    console.log("\n★ 검색·분류 (FR-CLI-003 · 007)");
    {
      const res = await callTool(rpc, "nwwork_search", { q: "MCP 로 등록한" });
      const d = parse(res) as {
        results: { id: string; url: string }[];
        searchTruncated?: boolean;
      };
      check(
        "찾힌다",
        d.results.some((r) => r.id === createdId)
      );
      check(
        "Neowave Work 안의 주소를 함께 준다",
        d.results[0]?.url?.startsWith("http") === true
      );
      /*
       * **`meta` 를 버리지 않습니다** (`DEC-048`). 봉투를 벗겨 `data` 만 주면
       * 「없다」와 「안 보여준다」의 구별이 조용히 사라집니다.
       */
      check(
        "잘렸는지 여부가 함께 온다",
        d.searchTruncated === false,
        String(d.searchTruncated)
      );

      const tax = await callTool(rpc, "nwwork_list_taxonomy", {});
      const t = parse(tax) as { categories: unknown[] };
      check(
        "분류가 온다",
        Array.isArray(t.categories) && t.categories.length > 0
      );
    }

    console.log("\n★ 아카이브는 GitHub 자료에만 (FR-CLI-008)");
    {
      const res = await callTool(rpc, "nwwork_archive_github", {
        id: createdId,
      });
      check("GitHub 자료가 아니면 거절", res.isError === true);
      check(
        "이유를 말한다",
        (res.content?.[0]?.text ?? "").includes("GitHub"),
        res.content?.[0]?.text ?? ""
      );
    }

    console.log("\n★ stdout 은 프로토콜 전용이다");
    check(
      "JSON-RPC 아닌 줄이 stdout 에 없다",
      rpc.junk.length === 0,
      rpc.junk.slice(0, 2).join(" | ")
    );
    check(
      "사람이 읽을 것은 stderr 로 간다",
      rpc.stderr.join("").includes("연결됨"),
      rpc.stderr.join("").trim().split("\n").slice(0, 2).join(" / ")
    );
  } finally {
    rpc.kill();
  }

  console.log("\n★ 폐기한 키로는 즉시 실패한다 (M3 DoD)");
  {
    const disposable = await apiKeyService.issue(
      { id: author.id, username: author.username, via: "WEB" },
      "곧 폐기할 키",
      ["resources:read"]
    );
    await apiKeyService.revoke(
      { id: author.id, username: author.username, via: "WEB" },
      disposable.id
    );

    const s = await start({
      NEOWAVE_WORK_URL: "http://localhost:3100",
      NEOWAVE_WORK_API_KEY: disposable.plaintext,
    });
    try {
      const res = await callTool(s.rpc, "nwwork_list_taxonomy", {});
      check("도구 호출이 실패한다", res.isError === true);
      const text = res.content?.[0]?.text ?? "";
      check("폐기된 키라고 말한다", text.includes("폐기"), text.slice(0, 80));
      /*
       * **「마이페이지에서 발급하세요」가 문구에 있어야 합니다** (`DEV-08 · 8.3`).
       * 에이전트는 이 문장을 사용자에게 그대로 전달합니다.
       */
      check("다음에 할 일을 말한다", text.includes("마이페이지"), "");
    } finally {
      s.rpc.kill();
    }
  }

  console.log(`\n합계: 통과 ${pass} · 실패 ${fail}`);
}

async function cleanup() {
  if (madeResources.length) {
    await db.resource.deleteMany({ where: { id: { in: madeResources } } });
  }
  if (madeUsers.length) {
    await db.apiKey.deleteMany({ where: { userId: { in: madeUsers } } });
    await db.auditLog.deleteMany({ where: { actorId: { in: madeUsers } } });
    await db.user.deleteMany({ where: { id: { in: madeUsers } } });
  }
}

run()
  .catch((e) => {
    console.error(e);
    fail++;
  })
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    process.exit(fail > 0 ? 1 : 0);
  });
