/**
 * 부하 시험 (`NFR-PERF-005` — 「20명 동시 사용 시 목표치 유지」).
 *
 *   npm run loadtest              1만 건 · 20명 · 30초
 *   npm run loadtest -- --keep    더미를 남긴다 (화면으로 직접 볼 때)
 *   LOAD_VUS=40 npm run loadtest  사람 수를 바꾼다
 *
 * `npm run dev` 가 아니라 **`npm run build; npm start` 로 띄운 서버**를
 * 재십시오. dev 서버는 요청마다 컴파일 여부를 확인하고 소스맵을 만듭니다 —
 * 그 숫자로 목표치를 판정하면 **실제보다 나쁜 쪽으로 틀립니다.**
 *
 * ## 왜 k6 가 아닌가
 *
 * `NFR-PERF-005` 의 「측정 방법」 칸은 k6 라고 적혀 있고, 이 스크립트는
 * 그것을 대신합니다. 이유는 도구 취향이 아니라 **이 앱의 부하가 로그인
 * 뒤에 있기 때문**입니다.
 *
 * - 재야 할 화면(목록·검색·상세)이 전부 **세션을 요구**합니다.
 * - k6 는 자체 JS 런타임이라 Prisma 도 `@node-rs/argon2` 도 못 씁니다.
 *   그래서 «계정과 세션을 만드는 Node 스크립트» + «부하를 거는 k6 스크립트»
 *   **두 벌**이 되고, 둘이 쿠키를 환경변수로 주고받게 됩니다.
 * - 도구도 하나 더 깝니다. 나머지 검증 열한 가지는 전부 `npm run …` 입니다
 *   (`REQ-01 · 1.7` 「유지보수 난이도가 낮은 구조를 우선한다」).
 *
 * 대신 **잃는 것을 적어 둡니다**: k6 의 램프업·시나리오·임계값 문법과
 * 분산 실행이 없습니다. 20명·한 대 규모에서는 필요하지 않지만, 2단계에서
 * 사내 서버로 옮기고 사람이 늘면 그때는 k6 가 맞습니다.
 *
 * ## 무엇을 «목표치»로 보는가
 *
 * `NFR-PERF-005` 는 자기 숫자가 없습니다 — 「목표치 유지」이고, 그 목표치는
 * `001`·`002`·`004` 입니다. 그래서 여기서 그 셋을 **동시 부하 아래에서**
 * 다시 잽니다. 한 번에 하나씩 잰 `bench-list` 와 다른 사실입니다.
 */
import { randomBytes } from "node:crypto";

import { MARK, N, clean, ensureAuthor, seed } from "./bench-list";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { hashPassword } from "@/server/auth/password";
import { issue as issueSession } from "@/server/auth/session";

const BASE = process.env.LOAD_BASE_URL ?? "http://localhost:3100";
const COOKIE = process.env.SESSION_COOKIE_NAME || "nw_session";
const VUS = Number(process.env.LOAD_VUS ?? 20);
const SECONDS = Number(process.env.LOAD_SECONDS ?? 30);

/** `NFR-PERF-001`·`002`·`004` — 이 스크립트가 판정하는 유일한 숫자 */
const TARGETS: { label: string; path: () => string; p95: number; nfr: string }[] = [
  { label: "자료 목록", path: () => "/resources", p95: 500, nfr: "NFR-PERF-001" },
  {
    label: "통합 검색",
    path: () => `/search?q=${encodeURIComponent(WORDS[Math.floor(Math.random() * WORDS.length)])}`,
    p95: 1000,
    nfr: "NFR-PERF-002",
  },
  { label: "자료 상세", path: () => detailPath(), p95: 700, nfr: "NFR-PERF-004" },
];

const WORDS = ["드론", "정사영상", "RAG", "임베딩", "에이전트", "GIS"];

let detailPaths: string[] = [];
function detailPath(): string {
  return detailPaths[Math.floor(Math.random() * detailPaths.length)]!;
}

function p(values: number[], q: number): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))]!;
}

interface Sample {
  target: number;
  ms: number;
  status: number;
}

/**
 * 사람 한 명이 하는 일 — **읽기만 합니다.**
 *
 * 20명이 «동시에» 자료를 등록하는 상황은 이 팀에서 일어나지 않습니다
 * (3개월 목표 200건). 목표치 셋도 전부 읽기 화면입니다.
 */
async function virtualUser(
  cookie: string,
  deadline: number,
  out: Sample[]
): Promise<void> {
  while (Date.now() < deadline) {
    const idx = Math.floor(Math.random() * TARGETS.length);
    const t = TARGETS[idx]!;
    const started = performance.now();
    let status = 0;
    try {
      const res = await fetch(BASE + t.path(), {
        headers: { cookie },
        redirect: "manual",
      });
      status = res.status;
      // **본문을 끝까지 읽습니다.** 헤더만 받고 끊으면 스트리밍하는 RSC 를
      // 「빠르다」고 잘못 재게 됩니다.
      await res.text();
    } catch {
      status = 0;
    }
    out.push({ target: idx, ms: performance.now() - started, status });
  }
}

async function main() {
  if (process.argv.includes("--clean")) {
    await clean();
    await redis.quit();
    await db.$disconnect();
    return;
  }

  const author = await ensureAuthor();
  const existing = await db.resource.count({ where: { summary: MARK } });
  if (existing < N) await seed(author.id);

  /*
   * **상세는 «있는» 자료로만 부릅니다.** 없는 slug 를 부르면 404 가 빨리
   * 돌아오고, 그 숫자로 「상세가 빠르다」고 말하게 됩니다.
   */
  const sample = await db.resource.findMany({
    where: { summary: MARK, status: "PUBLISHED", deletedAt: null },
    select: { type: true, slug: true },
    take: 200,
  });
  const TYPE_SEG: Record<string, string> = {
    AI_MATERIAL: "ai-material",
    GITHUB_REPO: "github-repo",
    MCP_SERVER: "mcp-server",
    SKILL: "skill",
    DEV_NOTE: "dev-note",
    PROMPT: "prompt",
  };
  detailPaths = sample.map((r) => `/resources/${TYPE_SEG[r.type]}/${r.slug}`);
  if (detailPaths.length === 0) {
    throw new Error("더미 자료가 없습니다 — 시딩이 실패했습니다");
  }

  /*
   * **사람마다 «자기» 세션입니다.** 한 쿠키를 20개가 나눠 쓰면 세션 조회가
   * 한 행에 몰려 캐시가 과하게 잘 듣고, 그러면 실제보다 좋게 나옵니다.
   */
  console.log(`계정 ${VUS}개 · 세션 발급 중…`);
  const cookies: string[] = [];
  const made: string[] = [];
  for (let i = 0; i < VUS; i++) {
    const u = await db.user.create({
      data: {
        username: `load_${i}_${randomBytes(3).toString("hex")}`,
        passwordHash: await hashPassword("Load!12345"),
        name: `부하 ${i}`,
        status: "ACTIVE",
        role: "MEMBER",
      },
      select: { id: true },
    });
    made.push(u.id);
    const { token } = await issueSession(u.id, { userAgent: "loadtest" });
    cookies.push(`${COOKIE}=${token}`);
  }

  const total = await db.resource.count({ where: { deletedAt: null } });
  console.log(
    `\n자료 ${total.toLocaleString()}건 · 동시 ${VUS}명 · ${SECONDS}초 · ${BASE}\n`
  );

  /*
   * **한 번 예열합니다.** 첫 요청은 라우트 컴파일·연결 풀 준비를 함께 겪습니다.
   * 그것을 표본에 넣으면 P95 가 아니라 「최초 1회」를 재게 됩니다.
   */
  for (const t of TARGETS) {
    await fetch(BASE + t.path(), { headers: { cookie: cookies[0]! } }).then((r) =>
      r.text()
    );
  }

  const samples: Sample[] = [];
  const deadline = Date.now() + SECONDS * 1000;
  const startedAt = Date.now();
  await Promise.all(cookies.map((c) => virtualUser(c, deadline, samples)));
  const elapsed = (Date.now() - startedAt) / 1000;

  /* ── 판정 ────────────────────────────────────────────────────────── */
  let fail = 0;
  console.log("화면별 응답 (동시 부하 아래)\n");
  console.log("  화면        요청    P50     P95     최대    목표    판정");
  for (let i = 0; i < TARGETS.length; i++) {
    const t = TARGETS[i]!;
    const mine = samples.filter((s) => s.target === i);
    const ms = mine.map((s) => s.ms);
    const p95 = p(ms, 0.95);
    const ok = p95 <= t.p95;
    if (!ok) fail++;
    console.log(
      `  ${t.label}  ${String(mine.length).padStart(5)}` +
        `  ${p(ms, 0.5).toFixed(0).padStart(5)}ms` +
        `  ${p95.toFixed(0).padStart(5)}ms` +
        `  ${Math.max(...ms).toFixed(0).padStart(5)}ms` +
        `  ${String(t.p95).padStart(4)}ms  ${ok ? "OK" : "실패"}  (${t.nfr})`
    );
  }

  /*
   * **200 이 아닌 응답을 «따로» 셉니다.**
   *
   * 오류는 대개 빠릅니다. 섞어서 P95 를 내면 **에러가 많을수록 좋아 보입니다** —
   * 성능 측정에서 가장 흔한 거짓말입니다.
   */
  const bad = samples.filter((s) => s.status !== 200);
  console.log(
    `\n  처리량 ${(samples.length / elapsed).toFixed(1)} req/s · ` +
      `총 ${samples.length}건 · 비정상 응답 ${bad.length}건`
  );
  if (bad.length > 0) {
    const byStatus = new Map<number, number>();
    for (const b of bad) byStatus.set(b.status, (byStatus.get(b.status) ?? 0) + 1);
    console.log(
      `  ✗ 비정상: ${[...byStatus].map(([s, c]) => `${s || "연결실패"}×${c}`).join(", ")}`
    );
    fail++;
  }

  // 표본이 적으면 P95 는 숫자놀음입니다 — 몇 건으로 판정했는지 밝힙니다
  if (samples.length < VUS * 10) {
    console.log(
      `  ⚠ 표본이 ${samples.length}건뿐입니다 — LOAD_SECONDS 를 늘리십시오`
    );
    fail++;
  }

  console.log(
    fail === 0
      ? `\n✓ 동시 ${VUS}명에서 목표치를 유지합니다 (NFR-PERF-005)`
      : `\n✗ ${fail}건이 목표치를 못 지켰습니다`
  );

  await db.session.deleteMany({ where: { userId: { in: made } } });
  await db.user.deleteMany({ where: { id: { in: made } } });
  if (!process.argv.includes("--keep")) await clean();
  else console.log("\n더미를 남깁니다 (--keep). 지우려면 --clean");

  await redis.quit();
  await db.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
