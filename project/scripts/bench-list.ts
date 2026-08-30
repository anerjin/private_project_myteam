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
const ROUNDS = Number(process.env.BENCH_ROUNDS ?? 200);
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
    // 상세 테이블은 `onDelete: Cascade` 지만 태그 연결은 직접 지운다
    await db.resourceTag.deleteMany({
      where: { resourceId: { in: resourceIds } },
    });
    await db.bookmark.deleteMany({
      where: { resourceId: { in: resourceIds } },
    });
    await db.resource.deleteMany({ where: { id: { in: resourceIds } } });
  }
  await db.tag.deleteMany({ where: { slug: { startsWith: "bench-" } } });
  await db.user.deleteMany({ where: { username: { startsWith: "bench_" } } });
  console.log(`더미 ${resourceIds.length}건 정리`);
}

/**
 * ## **여섯 종을 고루 심습니다**
 *
 * `RESOURCE_CARD_SELECT` 는 상세 테이블 **여섯 개를 LEFT JOIN** 합니다.
 * 시더가 `AI_MATERIAL` 만 심으면 다섯은 빈 테이블이라 그 조인이 **공짜**이고,
 * 그러면 이 벤치는 **`P5` 이전 세계**를 재는 것입니다.
 *
 * ## `DRAFT` 와 소프트 삭제를 섞습니다
 *
 * `toWhere` 의 `status='PUBLISHED' AND deleted_at IS NULL` 이 100% 선택적이면
 * **최선의 경우만** 재게 됩니다. `DEC-048` 이 *"raw 에 `status` 를 넣지 않으므로
 * 실효 상한은 2,000보다 낮다"* 고 명시한 손실도 심지 않으면 관측되지 않습니다.
 */
const DRAFT_RATIO = 0.1;
const DELETED_RATIO = 0.1;

const ALL_TYPES = [
  "AI_MATERIAL",
  "GITHUB_REPO",
  "MCP_SERVER",
  "SKILL",
  "DEV_NOTE",
  "PROMPT",
] as const;

async function seed(authorId: string) {
  console.log(`더미 ${N.toLocaleString()}건 생성 중… (6종 · 초안·삭제 섞음)`);
  const started = Date.now();
  const CHUNK = 500;
  const now = Date.now();

  for (let offset = 0; offset < N; offset += CHUNK) {
    const size = Math.min(CHUNK, N - offset);
    const rows = Array.from({ length: size }, (_, i) => {
      const n = offset + i;
      const w1 = WORDS[n % WORDS.length];
      const w2 = WORDS[(n * 7) % WORDS.length];
      const draft = n % Math.round(1 / DRAFT_RATIO) === 0;
      const deleted = !draft && n % Math.round(1 / DELETED_RATIO) === 1;
      return {
        id: `bench${n.toString().padStart(7, "0")}${randomBytes(4).toString("hex")}`,
        type: ALL_TYPES[n % ALL_TYPES.length],
        slug: `bench-${n}-${randomBytes(3).toString("hex")}`,
        title: `${w1} ${w2} 자료 ${n}`,
        summary: MARK,
        authorId,
        viewCount: (n * 13) % 5000,
        bookmarkCount: (n * 7) % 300,
        status: draft ? ("DRAFT" as const) : ("PUBLISHED" as const),
        deletedAt: deleted ? new Date(now - n * 1000) : null,
        // 정렬이 실제로 인덱스를 타는지 보려면 시각이 흩어져야 한다
        createdAt: new Date(now - n * 60_000),
      };
    });

    await db.resource.createMany({ data: rows, skipDuplicates: true });

    /*
     * 상세 행도 **타입마다** 심습니다. NOT NULL 이 있어 빈 행으로는 못 넣고,
     * 그래서 이 시더가 스키마와 어긋나면 여기서 터집니다 — 조용히 안 심고
     * 넘어가는 것보다 낫습니다.
     */
    const by = (t: (typeof ALL_TYPES)[number]) =>
      rows.filter((r) => r.type === t);

    await Promise.all([
      db.aiMaterial.createMany({
        skipDuplicates: true,
        data: by("AI_MATERIAL").map((r, i) => ({
          resourceId: r.id,
          materialKind: KINDS[i % KINDS.length],
        })),
      }),
      db.githubRepo.createMany({
        skipDuplicates: true,
        data: by("GITHUB_REPO").map((r) => ({
          resourceId: r.id,
          owner: `bench-owner-${r.id.slice(-6)}`,
          repo: `repo-${r.id.slice(-4)}`,
          topics: ["bench"],
        })),
      }),
      db.mcpServer.createMany({
        skipDuplicates: true,
        data: by("MCP_SERVER").map((r) => ({
          resourceId: r.id,
          transport: "STDIO" as const,
          configJson: '{"command":"npx"}',
          clientSupport: ["Claude Code"],
        })),
      }),
      db.skill.createMany({
        skipDuplicates: true,
        data: by("SKILL").map((r, i) => ({
          resourceId: r.id,
          skillName: `bench-skill-${i}-${r.id.slice(-6)}`,
          definition: "# bench",
          triggerCondition: "벤치",
          usageExample: "벤치",
          targetClients: ["Claude Code"],
        })),
      }),
      db.devNote.createMany({
        skipDuplicates: true,
        data: by("DEV_NOTE").map((r) => ({
          resourceId: r.id,
          noteKind: "TIP" as const,
        })),
      }),
      db.prompt.createMany({
        skipDuplicates: true,
        data: by("PROMPT").map((r) => ({
          resourceId: r.id,
          promptText: "[역할] 로서 정리",
          useCase: "벤치",
        })),
      }),
    ]);
  }

  /*
   * **태그와 북마크도 심습니다.**
   *
   * `findRelated`(상세 화면의 관련 자료)와 `tag` 필터는 `resource_tags` 를
   * `tag_id` 로 탑니다. 그런데 그 테이블의 PK 가 `(resource_id, tag_id)` 라
   * **`tag_id` 로 시작하는 인덱스가 없습니다** — 「인덱스를 안 탄다」가 아니라
   * **탈 인덱스가 없습니다.** 안 심으면 그 사실이 관측되지 않습니다.
   *
   * `listBookmarked`(`/bookmarks`)는 `bookmark` 를 기준 테이블로 뒤집고
   * 복합 커서를 쓰는 **완전히 다른 질의**인데 한 번도 재지 않았습니다.
   */
  const all = await db.resource.findMany({
    where: { summary: MARK },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  const tags = await Promise.all(
    WORDS.slice(0, 6).map((w, i) =>
      db.tag.upsert({
        where: { slug: `bench-${i}` },
        create: { slug: `bench-${i}`, label: w },
        update: {},
        select: { id: true },
      })
    )
  );
  const links = all.flatMap((r, i) => [
    { resourceId: r.id, tagId: tags[i % tags.length].id },
    { resourceId: r.id, tagId: tags[(i * 3 + 1) % tags.length].id },
  ]);
  for (let i = 0; i < links.length; i += 2000) {
    await db.resourceTag.createMany({
      data: links.slice(i, i + 2000),
      skipDuplicates: true,
    });
  }
  await db.tag.updateMany({
    where: { slug: { startsWith: "bench-" } },
    data: { usageCount: Math.round((all.length * 2) / tags.length) },
  });

  // 벤치 사용자가 500건을 북마크한 상태 — `/bookmarks` 가 빈 목록이면 못 잽니다
  await db.bookmark.createMany({
    skipDuplicates: true,
    data: all.slice(0, 500).map((r) => ({ userId: authorId, resourceId: r.id })),
  });

  /*
   * **`ANALYZE` 로 끝냅니다 — 이게 없으면 측정이 거짓말을 합니다.**
   *
   * 부하 시험을 처음 돌렸을 때 동시 20명에서 처리량이 **4.3 req/s**, 상세
   * P95 가 **15초**로 나왔습니다. 그런데 잠시 뒤 같은 데이터로 다시 돌리니
   * **58 req/s · 433ms** 였습니다. 차이는 하나뿐이었습니다 — 첫 실행은
   * **1만 행을 막 밀어 넣은 직후**였고, Postgres 의 플래너 통계가 「이 표는
   * 비어 있다」인 상태였습니다. 그 통계로 세운 계획은 실제 데이터에서
   * 최악으로 어긋납니다.
   *
   * 운영에서는 자료가 조금씩 쌓이고 autovacuum 이 통계를 따라갑니다. 즉
   * 첫 숫자는 **운영에서 일어나지 않는 상태**를 잰 것이고, 그대로 두면
   * 「상세가 15초 걸린다」를 믿고 엉뚱한 곳을 고치게 됩니다.
   *
   * 시더 «안»에 둡니다 — `bench-list` 와 `loadtest` 가 같은 함정을 밟지
   * 않으려면 한 곳이어야 합니다.
   */
  await db.$executeRawUnsafe("ANALYZE");

  console.log(`  생성 ${((Date.now() - started) / 1000).toFixed(1)}초 (ANALYZE 포함)`);
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
 *
 * > **한계를 그대로 적습니다.** 거울은 `SELECT id` 이고 실제 목록 질의는
 * > **상세 6개를 LEFT JOIN** 합니다. 그래서 여기서 `Index` 가 찍혀도
 * > 「목록 질의가 인덱스만 쓴다」는 뜻이 아니라 **정렬 경로가 그렇다**는
 * > 뜻입니다. 실제로 `DEC-052` 의 인덱스는 **계획은 고쳤지만 시간은 못 줄였고**,
 * > 남은 27ms 는 조인·매핑·북마크 확인 질의 쪽입니다.
 */
const SORT_SQL: Record<string, string> = {
  recent: "created_at DESC, id DESC",
  popular: "view_count DESC, id DESC",
  bookmarked: "bookmark_count DESC, id DESC",
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

/**
 * ## 측정 방법 셋을 고쳤습니다
 *
 * 1. **`ROUNDS=40` 의 p95 는 38번째 값 — 「뒤에서 두 번째」입니다.**
 *    그건 p95 가 아니라 «두 번째 최악»입니다. 기본을 200으로 올리고
 *    `min·median·max` 를 함께 찍습니다.
 * 2. **같은 인자를 반복하면 캐시와 계획이 더워집니다.** 라운드마다 인자를
 *    바꿉니다 — 전에는 「한 페이지를 40번 다시 읽는 비용」을 재고 있었습니다.
 * 3. **이건 «질의» 시간입니다.** `NFR-PERF-001` 은 화면(RSC 렌더 + 매핑 포함)이라
 *    라벨에 어느 쪽인지 적습니다.
 */
async function measure(
  label: string,
  fn: (round: number) => Promise<unknown>
): Promise<{ label: string; p50: number; p95: number }> {
  // 워밍업 — 첫 질의의 계획 수립·커넥션 비용을 빼고 잰다
  await fn(0);

  const times: number[] = [];
  for (let i = 0; i < ROUNDS; i++) {
    const t0 = performance.now();
    await fn(i + 1);
    times.push(performance.now() - t0);
  }

  const p50 = p(times, 0.5);
  const p95 = p(times, 0.95);
  const ok = p95 <= 500;
  console.log(
    `${ok ? "  OK  " : "  실패"} ${label.padEnd(30)} ` +
      `p50 ${p50.toFixed(0).padStart(4)}ms · p95 ${p95.toFixed(0).padStart(4)}ms · ` +
      `최대 ${Math.max(...times).toFixed(0).padStart(4)}ms${ok ? "" : "  ← 500ms 초과"}`
  );
  return { label, p50, p95 };
}

async function run() {
  if (process.argv.includes("--clean")) {
    await clean();
    await redis.quit();
    await db.$disconnect();
    return;
  }

  const author = await ensureAuthor();

  const existing = await db.resource.count({ where: { summary: MARK } });
  if (existing < N) await seed(author.id);

  const total = await db.resource.count({ where: { deletedAt: null } });
  console.log(`\n전체 자료 ${total.toLocaleString()}건 · ${ROUNDS}회 측정\n`);

  const page = { kind: "cursor" as const, size: PAGE_SIZE };

  /*
   * **라운드마다 인자를 바꿉니다.** 같은 페이지를 200번 다시 읽으면 shared_buffers
   * 와 계획 캐시가 더워져서 「한 페이지를 다시 읽는 비용」을 재게 됩니다.
   * `days` 를 흔들면 `where` 가 매번 달라져 그 온기가 걷힙니다.
   */
  const vary = (r: number) => ({ days: 3650 - (r % 40) });

  console.log("질의 시간 — 정렬 4축 (SORT_KEYS 전부)");
  await measure("최신순", (r) =>
    resourceService.list({ sort: "recent", ...vary(r) }, page, author.id)
  );
  await measure("조회순", (r) =>
    resourceService.list({ sort: "popular", ...vary(r) }, page, author.id)
  );
  await measure("북마크순", (r) =>
    resourceService.list({ sort: "bookmarked", ...vary(r) }, page, author.id)
  );
  await measure("제목순", (r) =>
    resourceService.list({ sort: "title", ...vary(r) }, page, author.id)
  );
  /*
   * **역방향도 봅니다.** `orderByFor` 가 축과 타이브레이커를 함께 뒤집으므로
   * 커서가 다른 길을 탑니다 — 인덱스가 생기면 방향이 판정에 들어옵니다.
   */
  await measure("최신순 역방향 (dir=asc)", (r) =>
    resourceService.list(
      { sort: "recent", dir: "asc", ...vary(r) },
      page,
      author.id
    )
  );

  console.log("\n질의 시간 — 필터·검색");
  await measure("검색 (본문 FTS)", (r) =>
    resourceService.list(
      { q: WORDS[r % WORDS.length], sort: "recent" },
      page,
      author.id
    )
  );
  await measure("타입 필터", (r) =>
    resourceService.list(
      { type: ALL_TYPES[r % ALL_TYPES.length], sort: "recent" },
      page,
      author.id
    )
  );
  /*
   * **태그 필터** — `resource_tags` 를 `tag_id` 로 탑니다. 그 테이블의 PK 가
   * `(resource_id, tag_id)` 라 **`tag_id` 로 시작하는 인덱스가 없습니다.**
   * 「인덱스를 안 탄다」가 아니라 **탈 인덱스가 없는** 경우입니다.
   */
  await measure("태그 필터", (r) =>
    resourceService.list(
      { tag: `bench-${r % 6}`, sort: "recent" },
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
  console.log("\n질의 시간 — 오프셋 (관리 목록)");
  /*
   * **오프셋은 두 갈래로 잽니다.**
   *
   * `list.schema.ts` 주석이 *"오프셋이 괜찮은 이유는 관리 목록이 필터로
   * 좁혀지기 때문"* 이라고 **전제**를 적어 뒀습니다. 그 전제가 참인지 보려면
   * 필터 있는 쪽과 없는 쪽을 나눠 재야 합니다.
   *
   * 그리고 오프셋 경로는 매번 `count(where)` 를 함께 돕니다 —
   * **`skip/take` 보다 그쪽이 먼저 무너집니다.**
   */
  for (const pageNo of [1, 40, 200, 400]) {
    await measure(`오프셋 ${pageNo}p (필터 없음)`, () =>
      resourceService.list(
        { sort: "recent" },
        { kind: "offset", page: pageNo, size: PAGE_SIZE },
        author.id
      )
    );
  }
  await measure("오프셋 40p (타입 필터)", (r) =>
    resourceService.list(
      { sort: "recent", type: ALL_TYPES[r % ALL_TYPES.length] },
      { kind: "offset", page: 40, size: PAGE_SIZE },
      author.id
    )
  );
  await measure("개수만 (count)", () =>
    db.resource.count({ where: { deletedAt: null, status: "PUBLISHED" } })
  );

  console.log("\n질의 시간 — 다른 모양의 질의");
  /*
   * `listBookmarked` 는 `bookmark` 를 **기준 테이블로 뒤집고** 복합 커서를
   * 씁니다. `P4` 에서 「전량을 읽고 JS 에서 잘랐다」를 고친 코드인데 한 번도
   * 재지 않았습니다 — 회귀가 보이지 않습니다.
   */
  await measure("북마크 목록 (/bookmarks)", () =>
    resourceService.listBookmarked(author.id)
  );
  {
    const sample = await db.resource.findFirst({
      where: { summary: MARK, deletedAt: null, status: "PUBLISHED" },
      select: { id: true, tags: { select: { tag: { select: { slug: true } } } } },
    });
    const tagSlugs = sample?.tags.map((t) => t.tag.slug) ?? [];
    await measure("관련 자료 (상세 화면)", () =>
      resourceService.findRelated(sample!.id, tagSlugs)
    );
  }
  /*
   * **대시보드가 가장 자주 열립니다.** `count` 넷 + `groupBy` 둘 + 태그 상위 —
   * 그런데 벤치에 없었습니다.
   */
  await measure("대시보드 숫자 (count ×4)", () =>
    resourceService.myCounts(author.id)
  );
  await measure("타입별 건수 (groupBy)", () => resourceService.countByType());
  await measure("카테고리별 건수", () => resourceService.countByCategory());
  await measure("인기 태그", () => resourceService.topTags(12));

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
  /*
   * ## 판정 기준 — **계획의 «모양»**
   *
   * 500ms 도, 「인덱스를 안 탄다」도 기준으로 못 씁니다.
   *
   * - **500ms 는 출시 게이트이지 설계 신호가 아닙니다.** 지금 전부 통과하고,
   *   그러면 인덱스를 하나도 안 넣습니다. 25만 건을 만드는 것은 `P7` 의
   *   에이전트 수집인데 **신호가 도착할 때는 이미 늦습니다.**
   * - **「인덱스를 안 탄다」는 오탐이 납니다.** 1만 행에서 Postgres 는
   *   **일부러** 순차 스캔을 고르고 그게 옳은 판단입니다. 그때 `EXPLAIN` 이
   *   말하는 것은 **계획기의 비용 모형에 대한 사실**이지 **질의 모양에 대한
   *   사실**이 아닙니다.
   *
   * > **출력이 `LIMIT 24` 로 묶여 있는데 어느 노드가 «읽는 행 수가 N 에
   * > 비례»하는가.** 비례하면 인덱스를 받고, 아니면 안 받는다.
   *
   * 이 기준은 밀리초가 아니라 노드가 말하므로 **1만 건에서 이미 판정이 납니다.**
   */
  console.log("\n계획의 모양 — 24건 내려고 몇 행을 만지는가 (EXPLAIN ANALYZE)");
  const plans = [];
  for (const s of ["recent", "popular", "bookmarked", "title"] as const) {
    plans.push(await explainSort(s, author.id));
  }
  const needIndex = plans.filter((p) => p.seqScan || p.sortNode);
  console.log(
    needIndex.length === 0
      ? "  → 전부 인덱스로 정렬됩니다. 추가할 것 없음"
      : `  → **전량을 읽어 정렬하는 축 ${needIndex.length}개**: ${needIndex.map((p) => p.sort).join(", ")}` +
          `\n     1만 건에서는 빠르지만 N 과 함께 자랍니다 — 인덱스 대상입니다`
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

/**
 * **더미 시더를 `loadtest.ts` 와 나눠 씁니다.**
 *
 * 부하 시험(`NFR-PERF-005`)도 1만 건이 필요한데, 시더를 한 벌 더 만들면
 * 「6종을 고루 심는다」·「초안과 삭제를 섞는다」 같은 **판단이 두 곳**에
 * 놓입니다. 한쪽만 고치면 두 측정이 서로 다른 세계를 재게 됩니다.
 *
 * 그래서 `seed`·`clean`·`MARK` 를 내보내고, **직접 실행됐을 때만** 측정합니다.
 */
export { MARK, N, clean, seed };

export async function ensureAuthor(): Promise<{ id: string }> {
  return db.user.upsert({
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
}

const isEntry = process.argv[1]?.replaceAll("\\", "/").endsWith("bench-list.ts");
if (isEntry) {
  run().catch(async (e) => {
    console.error(e);
    process.exit(1);
  });
}
