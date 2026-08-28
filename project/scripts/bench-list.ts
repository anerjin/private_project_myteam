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

/**
 * **계획을 봅니다** — 시간만으로는 판정할 수 없기 때문입니다.
 *
 * 1만 건에서는 정렬 인덱스가 없어도 17ms 입니다. 「500ms 이내」만 보면
 * **전부 통과하고 인덱스를 하나도 안 넣게 됩니다.** 그런데 인덱스가 없으면
 * Postgres 는 매번 **전체를 읽어 정렬**합니다 — 데이터가 늘면 그 비용이 자랍니다.
 *
 * > 그래서 **「느린가」가 아니라 「무엇을 하고 있는가」**를 함께 봅니다.
 * > `Seq Scan` + `Sort` 는 「지금은 빠르지만 자랄 것」이고,
 * > `Index Scan` 은 「데이터가 늘어도 같은 모양」입니다.
 *
 * ## 이 SQL 은 Prisma 가 «보내는» SQL 이 아니라 **거울**입니다
 *
 * Prisma 가 실제로 만든 SQL 을 꺼내려면 로거를 달아야 하는데, 그러면 `db`
 * 싱글턴을 벤치용으로 바꿔야 합니다. 대신 같은 모양의 SQL 을 손으로 쓰고
 * **결과 id 가 Prisma 경로와 같은지 확인**합니다 — 거울이 맞는지 «증명»하지
 * 않으면 이 측정 전체가 「실제 실행되지 않는 것에 대한 결론」이 됩니다
 * (이 저장소가 반복해서 겪은 그 형태입니다).
 */
const SORT_SQL: Record<string, string> = {
  recent: "created_at DESC, id DESC",
  popular: "view_count DESC, id DESC",
  title: "title ASC, id ASC",
};

async function explainSort(sort: keyof typeof SORT_SQL, authorId: string) {
  const order = SORT_SQL[sort];
  const rows = await db.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM resources
      WHERE deleted_at IS NULL AND status = 'PUBLISHED'
      ORDER BY ${order} LIMIT ${PAGE_SIZE}`
  );

  // **거울이 맞는가** — 다르면 아래 계획은 다른 질의의 계획이다
  const viaPrisma = await resourceService.list(
    { sort: sort as "recent" },
    { kind: "cursor", size: PAGE_SIZE },
    authorId
  );
  const same =
    rows.map((r) => r.id).join(",") ===
    viaPrisma.items.map((i) => i.id).join(",");

  const plan = await db.$queryRawUnsafe<{ "QUERY PLAN": unknown }[]>(
    `EXPLAIN (ANALYZE, FORMAT JSON)
     SELECT id FROM resources
      WHERE deleted_at IS NULL AND status = 'PUBLISHED'
      ORDER BY ${order} LIMIT ${PAGE_SIZE}`
  );
  const text = JSON.stringify(plan);
  const seqScan = text.includes('"Seq Scan"');
  const sortNode = text.includes('"Node Type":"Sort"');

  console.log(
    `  ${same ? "" : "거울 불일치! "}${sort.padEnd(8)} ` +
      `${seqScan ? "Seq Scan" : "Index"} ${sortNode ? "+ Sort" : "(정렬 없음)"}` +
      `${same ? "" : "  ← 이 계획은 믿을 수 없습니다"}`
  );
  return { sort, seqScan, sortNode, same };
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
  await measure("깊은 커서 (약 1000번째)", () =>
    resourceService.list(
      { sort: "recent" },
      { ...page, after: deep },
      author.id
    )
  );

  /*
   * ## **오프셋을 잽니다** — 지금까지 한 번도 재지 않았습니다
   *
   * 위 주석은 *"오프셋이라면 여기서 무너진다"* 라고 적혀 있었는데,
   * 이 스크립트는 **오프셋 경로를 한 번도 실행하지 않았습니다.**
   * `DEC-045` 가 「관리 목록은 오프셋」으로 갈랐고 그 근거가
   * *"지금은 괜찮다"* 였는데 **재 본 적이 없었습니다** — 옳은 결론이었을 수는
   * 있어도 «측정된» 결론은 아니었습니다.
   *
   * 오프셋은 `COUNT(*)` 도 함께 돕니다(「총 N건 중 2페이지」). 그 비용이
   * 커서와 갈리는 지점이 여기서 보입니다.
   */
  console.log("");
  for (const pageNo of [1, 40, 200, 400]) {
    await measure(`오프셋 ${pageNo}페이지`, () =>
      resourceService.list(
        { sort: "recent" },
        { kind: "offset", page: pageNo, size: PAGE_SIZE },
        author.id
      )
    );
  }

  /*
   * **상한에 닿는 검색** (`DEC-048`). 흔한 낱말은 후보가 2,000을 넘습니다 —
   * raw 로 2,001건을 뽑고 `id IN (…)` 2,000개를 Prisma 에 넘기는 경로가
   * 실제로 얼마나 드는지 봅니다. 상한을 「구조의 요구」라고 적어 뒀으니
   * 그 대가도 숫자로 있어야 합니다.
   */
  /*
   * 낱말을 고를 때 주의: 처음엔 «드론» 으로 쟀는데 **834건밖에 안 물어
   * 상한 경로를 한 번도 지나지 않았습니다.** 「상한 검색」이라는 이름표만 달고
   * 평범한 검색을 재고 있었던 셈입니다 — 이 스크립트가 고치려던 바로 그 형태입니다.
   * 더미 제목이 전부 `… 자료 {n}` 이라 «자료» 는 **전건**을 뭅니다.
   */
  const WIDE = "자료";
  const hitCount = await db.resource.count({
    where: { deletedAt: null, title: { contains: WIDE } },
  });
  console.log("");
  const probe = await resourceService.list(
    { q: WIDE, sort: "recent" },
    page,
    author.id
  );
  console.log(
    `  상한 도달: ${probe.searchTruncated ? "예" : "아니오"} (${hitCount.toLocaleString()}건 매칭)` +
      (probe.searchTruncated ? "" : "  ← 상한 경로를 안 지납니다. 낱말을 바꾸십시오")
  );
  await measure(`상한 검색 («${WIDE}»)`, () =>
    resourceService.list({ q: WIDE, sort: "recent" }, page, author.id)
  );

  /*
   * **커서 전수 순회** — 목록을 끝까지 넘기면 총 얼마인가.
   * 한 페이지가 빠른 것과 전체를 도는 것이 같은 이야기가 아닙니다.
   */
  {
    const t0 = performance.now();
    let c: string | undefined;
    let pages = 0;
    for (;;) {
      const r = await resourceService.list(
        { sort: "recent" },
        { ...page, after: c },
        author.id
      );
      pages++;
      c = r.nextCursor;
      if (!c) break;
    }
    const ms = performance.now() - t0;
    console.log(
      `  전수 순회  ${pages}페이지 ${(ms / 1000).toFixed(1)}초 · 페이지당 평균 ${(ms / pages).toFixed(0)}ms`
    );
  }

  /*
   * ## 계획 — **시간이 판정하지 못하는 것**
   *
   * 1만 건에서는 전부 500ms 안입니다. 「느린가」로는 인덱스를 판단할 수 없고,
   * 「무엇을 하고 있는가」를 봐야 합니다.
   */
  console.log("\n정렬 축이 인덱스를 타는가 (EXPLAIN ANALYZE)");
  const plans = [];
  for (const s of ["recent", "popular", "title"] as const) {
    plans.push(await explainSort(s, author.id));
  }
  const needIndex = plans.filter((p) => p.seqScan || p.sortNode);
  console.log(
    needIndex.length === 0
      ? "  → 셋 다 인덱스로 정렬됩니다. 추가할 것 없음"
      : `  → 전체 읽고 정렬하는 축 ${needIndex.length}개: ${needIndex.map((p) => p.sort).join(", ")}`
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
