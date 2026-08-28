/**
 * 목록 성능 측정 — `DEV-07 · 7.4` DoD 「자료 1만 건 더미로 목록 P95 500ms」.
 *
 *   npx tsx --conditions=react-server --env-file=.env scripts/bench-list.ts
 *   npx tsx … scripts/bench-list.ts --clean     (더미만 지움)
 *
 * **더미는 지우고 끝냅니다.** 남기면 다음 사람이 「자료가 왜 1만 건이지」를 겪습니다.
 * `--keep` 을 주면 남깁니다(화면으로 직접 볼 때).
 */
import { randomBytes } from "node:crypto";

import { PAGE_SIZE } from "@/features/resources/list.schema";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { hashPassword } from "@/server/auth/password";
import * as resourceService from "@/server/services/resource.service";

const N = Number(process.env.BENCH_N ?? 10_000);
const ROUNDS = Number(process.env.BENCH_ROUNDS ?? 40);
const MARK = "bench-dummy";

const KINDS = [
  "PAPER",
  "ARTICLE",
  "VIDEO",
  "MODEL",
  "SERVICE",
  "COURSE",
] as const;
const WORDS = [
  "드론",
  "정사영상",
  "포인트클라우드",
  "RAG",
  "임베딩",
  "에이전트",
  "사진측량",
  "GIS",
  "래스터",
  "벡터",
  "LLM",
  "파인튜닝",
];

function p(values: number[], q: number): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
}

async function clean() {
  const ids = await db.resource.findMany({
    where: { summary: MARK },
    select: { id: true },
  });
  const resourceIds = ids.map((r) => r.id);
  if (resourceIds.length) {
    await db.resourceTag.deleteMany({
      where: { resourceId: { in: resourceIds } },
    });
    await db.aiMaterial.deleteMany({
      where: { resourceId: { in: resourceIds } },
    });
    await db.resource.deleteMany({ where: { id: { in: resourceIds } } });
  }
  await db.user.deleteMany({ where: { username: { startsWith: "bench_" } } });
  console.log(`더미 ${resourceIds.length}건 정리`);
}

async function seed(authorId: string) {
  console.log(`더미 ${N.toLocaleString()}건 생성 중…`);
  const started = Date.now();
  const CHUNK = 500;

  for (let offset = 0; offset < N; offset += CHUNK) {
    const size = Math.min(CHUNK, N - offset);
    const rows = Array.from({ length: size }, (_, i) => {
      const n = offset + i;
      const w1 = WORDS[n % WORDS.length];
      const w2 = WORDS[(n * 7) % WORDS.length];
      return {
        id: `bench${n.toString().padStart(7, "0")}${randomBytes(4).toString("hex")}`,
        type: "AI_MATERIAL" as const,
        slug: `bench-${n}-${randomBytes(3).toString("hex")}`,
        title: `${w1} ${w2} 자료 ${n}`,
        summary: MARK,
        authorId,
        viewCount: (n * 13) % 5000,
        // 정렬이 실제로 인덱스를 타는지 보려면 시각이 흩어져야 한다
        createdAt: new Date(Date.now() - n * 60_000),
      };
    });

    await db.resource.createMany({ data: rows, skipDuplicates: true });
    await db.aiMaterial.createMany({
      data: rows.map((r, i) => ({
        resourceId: r.id,
        materialKind: KINDS[(offset + i) % KINDS.length],
      })),
      skipDuplicates: true,
    });
  }
  console.log(`  생성 ${((Date.now() - started) / 1000).toFixed(1)}초`);
}

async function measure(
  label: string,
  fn: () => Promise<unknown>
): Promise<void> {
  // 워밍업 — 첫 질의의 계획 수립·커넥션 비용을 빼고 잰다
  await fn();

  const times: number[] = [];
  for (let i = 0; i < ROUNDS; i++) {
    const t0 = performance.now();
    await fn();
    times.push(performance.now() - t0);
  }

  const p95 = p(times, 0.95);
  const ok = p95 <= 500;
  console.log(
    `${ok ? "  OK  " : "  실패"} ${label.padEnd(28)} p50 ${p(times, 0.5).toFixed(0).padStart(4)}ms · p95 ${p95.toFixed(0).padStart(4)}ms${ok ? "" : "  ← 500ms 초과"}`
  );
}

async function run() {
  if (process.argv.includes("--clean")) {
    await clean();
    await redis.quit();
    await db.$disconnect();
    return;
  }

  const author = await db.user.upsert({
    where: { username: "bench_author" },
    create: {
      username: "bench_author",
      passwordHash: await hashPassword("Bench!12345"),
      name: "벤치마크",
      status: "ACTIVE",
    },
    update: {},
    select: { id: true },
  });

  const existing = await db.resource.count({ where: { summary: MARK } });
  if (existing < N) await seed(author.id);

  const total = await db.resource.count({ where: { deletedAt: null } });
  console.log(`\n전체 자료 ${total.toLocaleString()}건 · ${ROUNDS}회 측정\n`);

  const page = { kind: "cursor" as const, size: PAGE_SIZE };

  await measure("첫 페이지 (최신순)", () =>
    resourceService.list({ sort: "recent" }, page, author.id)
  );
  await measure("조회순 정렬", () =>
    resourceService.list({ sort: "popular" }, page, author.id)
  );
  await measure("제목순 정렬", () =>
    resourceService.list({ sort: "title" }, page, author.id)
  );
  await measure("검색 (제목·요약)", () =>
    resourceService.list(
      { q: "포인트클라우드", sort: "recent" },
      page,
      author.id
    )
  );
  await measure("타입 필터", () =>
    resourceService.list(
      { type: "AI_MATERIAL", sort: "recent" },
      page,
      author.id
    )
  );

  // **깊은 커서** — 오프셋이라면 여기서 무너진다
  let cursor: string | undefined;
  for (let i = 0; i < 40; i++) {
    const r = await resourceService.list(
      { sort: "recent", cursor },
      { ...page, after: cursor },
      author.id
    );
    cursor = r.nextCursor;
    if (!cursor) break;
  }
  const deep = cursor;
  await measure("깊은 페이지 (약 1000번째)", () =>
    resourceService.list(
      { sort: "recent" },
      { ...page, after: deep },
      author.id
    )
  );

  if (!process.argv.includes("--keep")) {
    console.log("");
    await clean();
  } else {
    console.log("\n더미를 남깁니다 (--keep). 지우려면 --clean");
  }

  await redis.quit();
  await db.$disconnect();
}

run().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
