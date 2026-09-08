/**
 * `P7` 검증 — Ingest API (`API-100`~`108`, `FR-CLI-002`~`008`).
 *
 *   npm run verify:p7   (`npm run dev` 가 떠 있어야 합니다)
 *
 * ## **HTTP 로 부릅니다**
 *
 * service 를 직접 부르면 키 검증·스코프·레이트 리밋·오류 번역이 전부 빠집니다 —
 * 그리고 그것이 이 페이즈의 본체입니다. `P6` 에서 「service 를 직접 부른 것은
 * 화면 검증이 아니다」가 세 페이즈 묵은 결함을 잡은 것과 같은 이유입니다.
 */
import { randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { hashPassword } from "@/server/auth/password";
import * as apiKeyService from "@/server/services/api-key.service";
import type { Role } from "@/types";

const BASE = "http://localhost:3100/api/ingest";

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

async function mkUser(tag: string, role: Role) {
  const u = await db.user.create({
    data: {
      username: `vp7_${tag}_${randomBytes(4).toString("hex")}`,
      passwordHash: await hashPassword("Verify!12345"),
      name: `P7검증-${tag}`,
      status: "ACTIVE",
      role,
    },
    select: { id: true, username: true, role: true },
  });
  madeUsers.push(u.id);
  return u;
}

interface Res {
  status: number;
  body: { data?: unknown; error?: { code: string; message: string } };
}

async function call(
  path: string,
  key: string | null,
  init: RequestInit = {}
): Promise<Res> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as Res["body"];
  return { status: res.status, body };
}

async function run() {
  const author = await mkUser("author", "EDITOR");

  /*
   * **키는 실제 발급 경로로 만듭니다.** 해시를 손으로 넣으면 `verifyKey` 가
   * 보는 것과 다른 것을 시험하게 됩니다.
   */
  const issued = await apiKeyService.issue(
    { id: author.id, username: author.username, role: "EDITOR", via: "WEB" },
    "P7 검증",
    ["resources:read", "resources:write", "archive:run"]
  );
  const KEY = issued.plaintext;

  console.log("\n★ 키가 없거나 틀리면 들어오지 못한다 (NFR-SEC-018)");
  {
    let r = await call("/whoami", null);
    check("키가 없으면 401", r.status === 401, `${r.status}`);
    check(
      "무엇을 해야 하는지 말한다",
      (r.body.error?.message ?? "").includes("Authorization"),
      r.body.error?.message ?? ""
    );

    // ASCII 여야 합니다 — 헤더는 ByteString 이라 한글 키는 fetch 가 먼저 막습니다
    r = await call("/whoami", "nw_live_0000000000000000000000000000");
    check("틀린 키는 401", r.status === 401, r.body.error?.code ?? "");
  }

  console.log("\n★ API-108 whoami — 스코프는 «지금» 행사할 수 있는 것 (DEC-037)");
  {
    const r = await call("/whoami", KEY);
    const d = r.body.data as { username: string; role: string; scopes: string[]; via: string };
    check("200 이고 소유자를 말한다", r.status === 200 && d.username === author.username);
    check("경로가 MCP 로 잡힌다", d.via === "MCP", d.via);
    check(
      "EDITOR 는 archive:run 을 갖는다",
      d.scopes.includes("archive:run"),
      d.scopes.join(",")
    );
  }

  console.log("\n★ API-100 타입 스키마 — 서버가 만들어 내려준다 (FR-CLI-002)");
  {
    const r = await call("/content-types", KEY);
    const types = r.body.data as {
      code: string;
      label: string;
      detailSchema: { properties?: Record<string, unknown>; required?: string[] };
    }[];
    check("여섯 타입이 온다", types.length === 6, `${types.length}종`);

    const ai = types.find((t) => t.code === "AI_MATERIAL")!;
    check("JSON Schema 가 붙어 있다", Boolean(ai.detailSchema?.properties));
    check(
      "필수 필드가 표시된다",
      (ai.detailSchema.required ?? []).includes("materialKind"),
      JSON.stringify(ai.detailSchema.required)
    );
    check(
      "선택 필드도 온다",
      Object.keys(ai.detailSchema.properties ?? {}).includes("applicability")
    );

    /*
     * **`P5` 가 `| null` 을 지운 것이 여기서 값을 냅니다.** 일곱 번째 타입을
     * 추가하면 이 응답에 자동으로 들어갑니다 — MCP 서버 코드를 안 고칩니다.
     */
    const skill = types.find((t) => t.code === "SKILL")!;
    check(
      "P5 에서 연 타입도 스키마를 갖는다",
      (skill.detailSchema.required ?? []).includes("skillName"),
      JSON.stringify(skill.detailSchema.required)
    );

    /*
     * **배열 항목의 «모양»까지 내려줘야 합니다.**
     *
     * `MCP_SERVER` 의 `envVars`·`providedTools` 는 한동안 `items: {}`
     * (무엇이든)로 나갔습니다 — 입력 타입이 `z.array(z.unknown())` 이었고,
     * 진짜 검사는 `transform` 안에 있어 `z.toJSONSchema` 가 못 봤기 때문입니다.
     *
     * 그러면 이 API 는 **자기 계약을 어깁니다**: 에이전트가 스키마를 믿고
     * `["A","B"]` 를 보내면 서버가 422 로 거절합니다. 실제 자료를 채우다
     * 그렇게 걸렸습니다. 「스키마를 보고 만들면 통과한다」가 이 API 의 존재
     * 이유이므로, **그 약속이 지켜지는지**를 여기서 봅니다.
     */
    const mcp = types.find((t) => t.code === "MCP_SERVER")!;
    for (const [field, key] of [
      ["envVars", "key"],
      ["providedTools", "name"],
    ] as const) {
      const prop = mcp.detailSchema.properties?.[field] as
        | { anyOf?: { type?: string; items?: { properties?: Record<string, unknown> } }[] }
        | undefined;
      const arr = prop?.anyOf?.find((b) => b.type === "array");
      const props = Object.keys(arr?.items?.properties ?? {});
      check(
        `${field} 배열 항목의 모양이 내려온다`,
        props.includes(key),
        props.length ? props.join(", ") : "items 가 비어 있음 — 무엇이든 받는다고 말한다"
      );
    }
  }

  console.log("\n★ API-106 분류 — 있는 것만 쓰게 한다 (FR-CLI-007)");
  {
    const r = await call("/taxonomy", KEY);
    const d = r.body.data as {
      categories: { slug: string; children: unknown[] }[];
      tags: unknown[];
    };
    check("카테고리 트리가 온다", d.categories.length > 0, `${d.categories.length}개`);
    check("하위분류도 온다", d.categories.some((c) => c.children.length > 0));
  }

  console.log("\n★ API-104 등록 — 웹과 같은 zod 를 지난다 (FR-CLI-005)");
  {
    // 스키마를 안 지키면 «어느 칸»인지 말해야 한다
    let r = await call("/resources", KEY, {
      method: "POST",
      body: JSON.stringify({ type: "SKILL", title: "필수 빠짐" }),
    });
    check("필수 칸이 없으면 422", r.status === 422, `${r.status}`);
    check(
      "어느 칸인지 말한다",
      JSON.stringify(r.body.error).includes("skillName"),
      r.body.error?.message ?? ""
    );

    r = await call("/resources", KEY, {
      method: "POST",
      body: JSON.stringify({
        type: "AI_MATERIAL",
        title: "P7 CLI 등록 자료",
        summary: "에이전트가 넣었다",
        url: "https://arxiv.org/abs/2308.99999",
        materialKind: "PAPER",
        sourceName: "arXiv",
        applicability: "드론 영상 파이프라인",
        tags: "ai, 검증",
      }),
    });
    check("정상 등록은 201", r.status === 201, `${r.status}`);
    const created = r.body.data as {
      id: string;
      slug: string;
      url: string;
      queuedJobs: string[];
    };
    madeResources.push(created.id);

    /*
     * **응답의 URL 은 사람이 바로 열 수 있어야 합니다** (`DEV-05 · 5.11` 규칙 표).
     * 상대 경로였을 때는 CLI 로그에 `/resources/…` 만 남아 열 수 없었습니다.
     */
    check(
      "자료 URL 이 절대 주소다",
      created.url.startsWith("http") && created.url.includes("/resources/ai-material/"),
      created.url
    );
    // **건 작업만 담습니다** — GitHub 자료가 아니므로 비어 있는 것이 맞습니다
    check(
      "안 건 작업을 담지 않는다",
      Array.isArray(created.queuedJobs) && created.queuedJobs.length === 0,
      JSON.stringify(created.queuedJobs)
    );

    const row = await db.resource.findUniqueOrThrow({
      where: { id: created.id },
      select: { sourceChannel: true, authorId: true, title: true },
    });
    /*
     * **등록 경로가 `MCP` 로 남습니다** (`FR-CLI-005`, `DEC-029`).
     * 검수를 폐기하며 「구분은 `source_channel` 이 한다」로 정했고 그 값입니다.
     */
    check("source_channel 이 MCP 다", row.sourceChannel === "MCP", row.sourceChannel);
    check("등록자는 키 소유자다", row.authorId === author.id);

    const detail = await db.aiMaterial.findUnique({
      where: { resourceId: created.id },
    });
    check("상세 테이블까지 관통한다", detail?.materialKind === "PAPER");

    // 감사 로그에 via=MCP
    const log = await db.auditLog.findFirst({
      where: { targetId: created.id, action: "RESOURCE_CREATE" },
      select: { via: true, apiKeyId: true },
    });
    check("감사 로그가 MCP 로 남는다", log?.via === "MCP", log?.via ?? "");
    check("어느 키였는지도 남는다", Boolean(log?.apiKeyId));
  }

  console.log("\n★ 중복은 CLI 에서만 거절한다 (DEC-047)");
  {
    const r = await call(
      `/duplicate?url=${encodeURIComponent("http://arxiv.org/abs/2308.99999?utm_source=x")}`,
      KEY
    );
    const d = r.body.data as {
      normalizedUrl: string;
      duplicate: { title: string } | null;
    };
    check(
      "다르게 쓴 같은 URL 을 중복으로 본다",
      d.duplicate?.title === "P7 CLI 등록 자료",
      JSON.stringify(d)
    );
    check("왜 같은지 보이게 정규화 결과를 준다", Boolean(d.normalizedUrl));

    const again = await call("/resources", KEY, {
      method: "POST",
      body: JSON.stringify({
        type: "AI_MATERIAL",
        title: "같은 URL 다시",
        url: "https://arxiv.org/abs/2308.99999",
        materialKind: "ARTICLE",
      }),
    });
    /*
     * **웹은 「그대로 등록」을 허용합니다.** 사람이 배너를 보고 의식하고 고르니까요.
     * 에이전트는 루프를 돌며 조용히 중복을 만들 수 있어 `409` 입니다.
     */
    check("등록은 409 로 거절한다", again.status === 409, `${again.status}`);
    check(
      "무엇과 겹쳤는지 말한다",
      (again.body.error?.message ?? "").includes("P7 CLI 등록 자료"),
      again.body.error?.message ?? ""
    );
    /*
     * **문구가 아니라 «본문»에 담겨 있어야 합니다.** 문장을 파싱하게 두면
     * 문구를 다듬는 순간 에이전트가 깨집니다.
     */
    const dupData = again.body.data as { duplicate?: { id: string; url: string } };
    check(
      "기존 자료를 본문에 담아 준다",
      dupData?.duplicate?.id === madeResources[0],
      JSON.stringify(dupData ?? null)
    );
    check(
      "그 자료의 절대 URL 도 준다",
      Boolean(dupData?.duplicate?.url?.startsWith("http")),
      dupData?.duplicate?.url ?? ""
    );
  }

  console.log("\n★ 비밀값은 저장하지 않는다 (NFR-SEC-008)");
  {
    // 실제 토큰 «모양»
    let r = await call("/resources", KEY, {
      method: "POST",
      body: JSON.stringify({
        type: "DEV_NOTE",
        title: "토큰이 섞인 노트",
        noteKind: "TIP",
        body: "배포 스크립트: GITHUB_TOKEN=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 로 돌린다",
      }),
    });
    check("토큰이 들어오면 저장하지 않는다", r.status === 422, `${r.status}`);
    check(
      "무엇이 걸렸는지 말한다",
      (r.body.error?.message ?? "").includes("GitHub 토큰"),
      r.body.error?.message ?? ""
    );
    /*
     * **값을 되돌려 주지 않습니다.** 이 문구는 응답과 감사 로그에 남으므로
     * 원문을 실으면 차단하려던 것을 스스로 흘립니다.
     */
    check(
      "토큰 원문을 되돌려 주지 않는다",
      !JSON.stringify(r.body).includes("ABCDEFGHIJKLMNOPQRSTUVWXYZ"),
      ""
    );

    /*
     * **토큰 «이야기»는 막으면 안 됩니다.** 여기는 AI 도구 지식 베이스라
     * 「GitHub 토큰은 ghp_ 로 시작한다」는 문장이 정상 자료입니다 —
     * 접두사만 보는 규칙은 자기 도메인의 자료를 거부합니다.
     */
    r = await call("/resources", KEY, {
      method: "POST",
      body: JSON.stringify({
        type: "DEV_NOTE",
        title: "P7 토큰 표기 규칙 메모",
        noteKind: "CONVENTION",
        body: "GitHub 개인 토큰은 ghp_ 로 시작하고, Anthropic 키는 sk-ant- 로 시작한다. 실제 값은 .env 에 둔다.",
      }),
    });
    check("토큰을 «설명하는» 자료는 통과한다", r.status === 201, `${r.status}`);
    if (r.status === 201) madeResources.push((r.body.data as { id: string }).id);

    // 수정으로 나중에 붙이는 경로도 막혀야 한다
    const patch = await call(`/resources/${madeResources[0]}`, KEY, {
      method: "PATCH",
      body: JSON.stringify({ keyPoints: "AWS 키: AKIAIOSFODNN7EXAMPLE" }),
    });
    check("나중에 붙이는 것도 막는다", patch.status === 422, `${patch.status}`);
  }

  console.log("\n★ API-101·102 검색·상세 (FR-CLI-003)");
  {
    const r = await call("/search?q=" + encodeURIComponent("P7 CLI"), KEY);
    const items = r.body.data as { id: string; title: string }[];
    check("검색으로 찾힌다", items.some((i) => i.id === madeResources[0]));

    const one = await call(`/resources/${madeResources[0]}`, KEY);
    const d = one.body.data as { detail: { type: string }; sourceChannel: string };
    check("상세가 타입 상세를 싣는다", d.detail.type === "AI_MATERIAL");
    check("등록 경로도 보인다", d.sourceChannel === "MCP");
  }

  console.log("\n★ API-105 보강 — 한 칸을 고쳐도 나머지가 안 지워진다 (FR-CLI-006)");
  {
    const r = await call(`/resources/${madeResources[0]}`, KEY, {
      method: "PATCH",
      body: JSON.stringify({ keyPoints: "- 나중에 찾은 요점" }),
    });
    check("200 이다", r.status === 200, `${r.status}`);

    const detail = await db.aiMaterial.findUniqueOrThrow({
      where: { resourceId: madeResources[0] },
    });
    check("보낸 칸이 들어간다", detail.keyPoints === "- 나중에 찾은 요점");
    /*
     * **안 보낸 칸이 지워지면 안 됩니다.** `parseResourceInput` 은 전체 입력을
     * 받으므로 라우트가 지금 값을 먼저 읽어 합칩니다 — `P5` 에서 실측한
     * `upsert.update` 의 `undefined` 함정과 같은 자리입니다.
     */
    check("안 보낸 칸은 그대로다", detail.sourceName === "arXiv", detail.sourceName ?? "");
    const res = await db.resource.findUniqueOrThrow({
      where: { id: madeResources[0] },
      select: { title: true },
    });
    check("제목도 그대로다", res.title === "P7 CLI 등록 자료", res.title);
  }

  console.log("\n★ 스코프 — 역할이 내려가면 키도 좁아진다 (DEC-037 · NFR-SEC-017)");
  {
    const member = await mkUser("member", "MEMBER");
    const memberKey = await apiKeyService.issue(
      { id: member.id, username: member.username, role: "MEMBER", via: "WEB" },
      "MEMBER 키",
      ["resources:read", "resources:write"]
    );

    const r = await call(
      `/resources/${madeResources[0]}/archive`,
      memberKey.plaintext,
      { method: "POST" }
    );
    check(
      "MEMBER 키는 archive:run 이 없어 403",
      r.status === 403,
      `${r.status} ${r.body.error?.code ?? ""}`
    );

    const who = await call("/whoami", memberKey.plaintext);
    const d = who.body.data as { scopes: string[] };
    check(
      "whoami 도 그 스코프를 안 보여준다",
      !d.scopes.includes("archive:run"),
      d.scopes.join(",")
    );
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
    console.error(e instanceof AppError ? e.message : e);
    fail++;
  })
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    process.exit(fail > 0 ? 1 : 0);
  });
