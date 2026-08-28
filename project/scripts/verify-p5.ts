/**
 * `P5` 검증 — 콘텐츠 타입 6종 관통.
 *
 *   npm run verify:p5
 *
 * ## 「행이 생긴다」로는 부족합니다
 *
 * `resource.mapper.toDetail()` 은 **행이 없어도 그럴듯한 기본값을 만들어 냅니다** —
 * `materialKind ?? "ARTICLE"`, `transport ?? "STDIO"`, `usageStatus ?? "REVIEWING"`,
 * `owner ?? ""`. 즉 **`writeDetail` 이 조용히 실패해도 상세 화면은 멀쩡해 보입니다.**
 * 그래서 이 검증은 화면이 아니라 **DB 행의 값**을 봅니다.
 *
 * ## 수정에서 «지워지는가»를 함께 봅니다
 *
 * `writeDetail` 안은 `upsert` 이고, **Prisma 의 `update` 는 `undefined` 를
 * 「그대로 두라」로 읽습니다.** zod `.optional()` 의 출력이 바로 그것이라,
 * 스키마 출력을 그대로 넘기면 **칸을 비우고 저장해도 옛 값이 남습니다.**
 * 오류도 없고 화면은 저장됐다고 말합니다. 등록만 확인하면 이 구멍을 못 봅니다.
 */
import { randomBytes } from "node:crypto";

import { DETAIL_SCHEMAS } from "@/features/resources/content-types/schemas";
import { parseResourceInput } from "@/features/resources/form.schema";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/server/auth/actor";
import { hashPassword } from "@/server/auth/password";
import * as resourceService from "@/server/services/resource.service";
import * as resourceWrite from "@/server/services/resource.write";
import type { ResourceType } from "@/types";

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
      username: `vp5_${tag}_${randomBytes(4).toString("hex")}`,
      passwordHash: await hashPassword("Verify!12345"),
      name: `P5검증-${tag}`,
      status: "ACTIVE",
      role: "MEMBER",
    },
    select: { id: true, username: true, role: true },
  });
  madeUsers.push(u.id);
  return u;
}

const actorOf = (u: { id: string; username: string; role: string }): Actor => ({
  id: u.id,
  username: u.username,
  role: u.role as Actor["role"],
  via: "WEB",
});

/** 폼이 보내는 것과 «같은 모양» — `FormData` 는 전부 문자열이다 */
function formLike(over: Record<string, unknown>) {
  return {
    title: "P5 검증 자료",
    summary: "6종 관통",
    url: "",
    body: "본문",
    category: "",
    tags: "검증",
    ...over,
  };
}

/**
 * 타입마다 **채운 입력**과 **비운 입력**을 짝으로 둡니다.
 * 비운 쪽이 「수정에서 지워지는가」를 봅니다 — 필수 칸은 비울 수 없으므로 남깁니다.
 */
interface Case {
  type: ResourceType;
  /** 상세 테이블을 읽는 Prisma 델리게이트 이름 */
  table: keyof typeof TABLES;
  full: Record<string, unknown>;
  /** 지운 뒤 그 칸이 DB 에서 어떤 값이어야 하는가 */
  cleared: Record<string, unknown>;
  expect: Record<string, unknown>;
}

const TABLES = {
  aiMaterial: (id: string) => db.aiMaterial.findUnique({ where: { resourceId: id } }),
  githubRepo: (id: string) => db.githubRepo.findUnique({ where: { resourceId: id } }),
  mcpServer: (id: string) => db.mcpServer.findUnique({ where: { resourceId: id } }),
  skill: (id: string) => db.skill.findUnique({ where: { resourceId: id } }),
  devNote: (id: string) => db.devNote.findUnique({ where: { resourceId: id } }),
  prompt: (id: string) => db.prompt.findUnique({ where: { resourceId: id } }),
};

const CASES: Case[] = [
  {
    type: "AI_MATERIAL",
    table: "aiMaterial",
    full: {
      materialKind: "PAPER",
      sourceName: "arXiv",
      authors: "홍길동, 김철수",
      publishedAt: "2026-01-15",
      language: "KO",
      keyPoints: "요점",
      applicability: "적용",
    },
    cleared: { sourceName: "", authors: "", keyPoints: "", applicability: "" },
    expect: {
      materialKind: "PAPER",
      sourceName: "arXiv",
      authors: ["홍길동", "김철수"],
      language: "KO",
    },
  },
  {
    type: "GITHUB_REPO",
    table: "githubRepo",
    full: { url: "https://github.com/modelcontextprotocol/servers/tree/main" },
    cleared: {},
    expect: { owner: "modelcontextprotocol", repo: "servers" },
  },
  {
    type: "MCP_SERVER",
    table: "mcpServer",
    full: {
      transport: "STDIO",
      packageName: "@scope/srv",
      installCommand: "npx -y @scope/srv",
      configJson: '{"command":"npx"}',
      clientSupport: "Claude Code, Cursor",
      envVars: '[{"key":"TOKEN","required":true}]',
      usageStatus: "ADOPTED",
    },
    cleared: { packageName: "", installCommand: "", clientSupport: "", envVars: "" },
    expect: {
      transport: "STDIO",
      packageName: "@scope/srv",
      clientSupport: ["Claude Code", "Cursor"],
      usageStatus: "ADOPTED",
    },
  },
  {
    type: "SKILL",
    table: "skill",
    full: {
      skillName: "queenbee-collect",
      definition: "# Skill\n본문",
      triggerCondition: "자료를 등록할 때",
      usageExample: "«찾아서 등록해줘»",
      targetClients: "Claude Code, Cursor",
      version: "1.0.0",
    },
    cleared: { targetClients: "", version: "" },
    expect: {
      skillName: "queenbee-collect",
      triggerCondition: "자료를 등록할 때",
      targetClients: ["Claude Code", "Cursor"],
      version: "1.0.0",
    },
  },
  {
    type: "DEV_NOTE",
    table: "devNote",
    full: {
      noteKind: "TROUBLESHOOT",
      relatedProject: "QueenBee",
      occurredAt: "2026-02-01",
    },
    cleared: { relatedProject: "", occurredAt: "" },
    expect: { noteKind: "TROUBLESHOOT", relatedProject: "QueenBee" },
  },
  {
    type: "PROMPT",
    table: "prompt",
    full: {
      promptText: "[역할] 로서 [주제] 를 정리해 줘. 다시 [역할].",
      useCase: "요약",
      targetModel: "claude",
    },
    cleared: { targetModel: "" },
    expect: { useCase: "요약", targetModel: "claude" },
  },
];

function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function msg(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "(오류 없음)";
  } catch (e) {
    return e instanceof AppError ? e.message : `(${String(e)})`;
  }
}

async function run() {
  const user = await mkUser("author");
  const actor = actorOf(user);

  console.log("\n★ 레지스트리 — 여섯 타입이 모두 스키마를 갖는다");
  {
    const missing = (Object.keys(DETAIL_SCHEMAS) as ResourceType[]).filter(
      (t) => !DETAIL_SCHEMAS[t]
    );
    check("DETAIL_SCHEMAS 에 빈 칸이 없다", missing.length === 0, missing.join(", "));
    check("여섯 종이다", Object.keys(DETAIL_SCHEMAS).length === 6);
  }

  for (const c of CASES) {
    console.log(`\n★ ${c.type} — 폼 → zod → service → ${c.table} 행`);

    const parsed = parseResourceInput(
      formLike({ ...c.full, type: c.type, title: `P5 ${c.type}` })
    );
    if (!parsed.ok) {
      check("파싱된다", false, JSON.stringify(parsed.fieldErrors));
      continue;
    }
    check("파싱된다", true);

    const created = await resourceWrite.create(actor, parsed.data);
    madeResources.push(created.id);

    const row = (await TABLES[c.table](created.id)) as Record<string, unknown> | null;
    check("상세 행이 생긴다", row !== null);
    if (!row) continue;

    /*
     * **값까지 봅니다.** 행만 확인하면 매핑이 절반만 돌아도 통과합니다 —
     * 그리고 `toDetail()` 이 없는 값에 기본값을 만들어 주므로 화면은 멀쩡합니다.
     */
    for (const [k, want] of Object.entries(c.expect)) {
      check(`  ${k} 가 그대로 저장된다`, eq(row[k], want), `${JSON.stringify(row[k])}`);
    }

    // ── 수정: 채운 칸을 비우면 DB 에서도 비어야 한다 ──
    if (Object.keys(c.cleared).length > 0) {
      const again = parseResourceInput(
        formLike({
          ...c.full,
          ...c.cleared,
          type: c.type,
          title: `P5 ${c.type}`,
        })
      );
      if (!again.ok) {
        check("  비운 입력이 파싱된다", false, JSON.stringify(again.fieldErrors));
      } else {
        await resourceWrite.update(actor, created.id, again.data);
        const after = (await TABLES[c.table](created.id)) as Record<
          string,
          unknown
        > | null;
        for (const k of Object.keys(c.cleared)) {
          const v = after?.[k];
          const emptied = v === null || eq(v, []) || v === "";
          check(
            `  «${k}» 를 지우면 DB 에서도 비워진다`,
            emptied,
            JSON.stringify(v)
          );
        }
      }
    }
  }

  console.log("\n★ PROMPT 의 변수는 원문에서 «파생»된다");
  {
    const r = madeResources[madeResources.length - 1];
    const row = await db.prompt.findUnique({ where: { resourceId: r } });
    check(
      "[역할]·[주제] 를 중복 없이 뽑는다",
      eq(row?.variables, [{ name: "역할" }, { name: "주제" }]),
      JSON.stringify(row?.variables)
    );
  }

  console.log("\n★ GITHUB_REPO — URL 이 정체성이다");
  {
    const bad = parseResourceInput(
      formLike({ type: "GITHUB_REPO", title: "잘못된 주소", url: "https://example.com/a" })
    );
    check(
      "GitHub 주소가 아니면 거절한다",
      !bad.ok && Boolean(bad.fieldErrors.url),
      bad.ok ? "(통과해 버림)" : JSON.stringify(bad.fieldErrors.url)
    );

    const noUrl = parseResourceInput(
      formLike({ type: "GITHUB_REPO", title: "주소 없음", url: "" })
    );
    check("URL 이 없으면 거절한다", !noUrl.ok);

    const reserved = parseResourceInput(
      formLike({
        type: "GITHUB_REPO",
        title: "예약 경로",
        url: "https://github.com/settings/profile",
      })
    );
    check("예약 경로를 저장소로 보지 않는다", !reserved.ok);

    /*
     * **한 저장소를 여러 주소로 가리킬 수 있습니다.**
     * `normalizeUrl` 이 `owner/repo` 까지 접으므로 넷이 같은 값이 됩니다.
     */
    const forms = [
      "https://github.com/octocat/Hello-World",
      "https://www.github.com/octocat/Hello-World/",
      "http://github.com/octocat/Hello-World/tree/main",
      "https://github.com/octocat/Hello-World.git",
    ];
    const normalized = new Set(forms.map((u) => resourceWrite.normalizeUrl(u)));
    check(
      "저장소 주소 네 가지가 한 값으로 접힌다",
      normalized.size === 1 &&
        [...normalized][0] === "https://github.com/octocat/Hello-World",
      [...normalized].join(" · ")
    );
  }

  console.log("\n★ 같은 저장소는 하나만 (DEC-050) — 그러나 지운 것은 다시 등록된다");
  {
    const mk = (title: string, url: string) =>
      parseResourceInput(formLike({ type: "GITHUB_REPO", title, url }));

    const a = mk("저장소 A", "https://github.com/vendor/thing");
    if (!a.ok) throw new Error("파싱 실패");
    const first = await resourceWrite.create(actor, a.data);
    madeResources.push(first.id);
    check("처음 등록된다", Boolean(first.id));

    // 다른 주소 형태로 같은 저장소 — 접힌 값이 같으므로 막혀야 한다
    const b = mk("같은 저장소 다른 주소", "https://github.com/vendor/thing/tree/main");
    if (!b.ok) throw new Error("파싱 실패");
    const dup = await msg(() => resourceWrite.create(actor, b.data));
    check(
      "다르게 쓴 같은 저장소가 막힌다",
      dup.includes("이미 등록돼 있습니다"),
      dup
    );
    check(
      "그리고 «왜» 막히는지 말한다",
      dup.includes("아카이브") && dup.includes("관련"),
      "「중복입니다」로만 끝나면 사람이 버그로 읽는다"
    );

    /*
     * > **이것이 `DEC-050` 의 본체입니다.** 전에는 `github_repos(owner, repo)`
     * > 유니크가 막았는데 그 테이블에는 `deleted_at` 이 없어 **소프트 삭제를
     * > 볼 수 없었습니다** — 지웠다 다시 등록하면 30일간 영원히 `P2002` 였습니다.
     */
    await resourceService.remove(actorOf(user), first.id);
    const c = mk("지운 뒤 다시", "https://github.com/vendor/thing");
    if (!c.ok) throw new Error("파싱 실패");
    const again = await msg(async () => {
      const r = await resourceWrite.create(actor, c.data);
      madeResources.push(r.id);
    });
    check("소프트 삭제한 저장소는 다시 등록된다", again === "(오류 없음)", again);
  }

  console.log("\n★ 목록·상세에서 여섯 종이 보인다");
  {
    const list = await resourceService.list(
      { sort: "recent" },
      { kind: "cursor", size: 50 },
      user.id
    );
    const mine = list.items.filter((r) => madeResources.includes(r.id));
    const kinds = new Set(mine.map((r) => r.detail.type));
    check("여섯 타입이 모두 목록에 나온다", kinds.size === 6, [...kinds].join(", "));

    for (const r of mine) {
      const d = await resourceService.getBySlug(r.slug, user.id, "MEMBER");
      check(`  ${d.type} 상세가 열린다`, d.detail.type === d.type);
    }
  }

  console.log(`\n합계: 통과 ${pass} · 실패 ${fail}`);
}

async function cleanup() {
  if (madeResources.length) {
    await db.resource.deleteMany({ where: { id: { in: madeResources } } });
  }
  if (madeUsers.length) {
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
