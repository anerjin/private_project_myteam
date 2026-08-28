/**
 * P4 검증 — `DEV-07 · 7.4` DoD 의 **「확인하는 법」**.
 *
 *   npx tsx --conditions=react-server --env-file=.env scripts/verify-p4.ts
 *
 * `DEV-07 · 7.4` 가 *"`M0.5` 는 화면 쪽 확장성만 증명했다 —
 * **zod · service · Prisma 는 아직 한 번도 통과하지 않았다**"* 고 못 박았습니다.
 * 이 스크립트가 그 관통을 시연합니다.
 */
import { randomBytes } from "node:crypto";

import { parseResourceInput } from "@/features/resources/form.schema";
import { PAGE_SIZE, parseListQuery } from "@/features/resources/list.schema";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { redis } from "@/lib/redis";
import type { Actor } from "@/server/auth/actor";
import { hashPassword } from "@/server/auth/password";
import * as contentTypeService from "@/server/services/content-type.service";
import * as resourceService from "@/server/services/resource.service";
import * as resourceWrite from "@/server/services/resource.write";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(
    `${ok ? "  OK  " : "  실패"} ${label}${detail ? " — " + detail : ""}`
  );
  if (ok) pass++;
  else fail++;
}

const made: string[] = [];
const madeResources: string[] = [];

async function mkUser(tag: string) {
  const u = await db.user.create({
    data: {
      username: `vp4_${tag}_${randomBytes(4).toString("hex")}`,
      passwordHash: await hashPassword("Verify!12345"),
      name: `P4검증-${tag}`,
      status: "ACTIVE",
      role: "MEMBER",
    },
    select: { id: true, username: true, role: true },
  });
  made.push(u.id);
  return u;
}

const actorOf = (u: { id: string; username: string; role: string }): Actor => ({
  id: u.id,
  username: u.username,
  role: u.role as Actor["role"],
  via: "WEB",
});

async function msg(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "(오류 없음)";
  } catch (e) {
    return e instanceof AppError ? e.message : `(${String(e)})`;
  }
}

/** 폼이 보내는 것과 «같은 모양» — `FormData` 는 전부 문자열이다 */
function formLike(over: Record<string, string> = {}) {
  return {
    type: "AI_MATERIAL",
    title: "검증용 AI 자료",
    summary: "관통 확인",
    url: "",
    body: "## 제목\n본문",
    category: "",
    tags: "AI, 검증 , ai",
    materialKind: "PAPER",
    sourceName: "arXiv",
    authors: "홍길동, 김철수",
    publishedAt: "2026-01-15",
    language: "KO",
    readingTime: "12",
    keyPoints: "- 요점",
    applicability: "드론 영상 파이프라인에 적용",
    ...over,
  };
}

async function run() {
  const user = await mkUser("author");
  const actor = actorOf(user);

  console.log("\n★ 관통 — 폼 모양 입력 → zod → service → Prisma 상세 테이블");
  {
    const parsed = parseResourceInput(formLike());
    check("zod 가 폼 문자열을 파싱한다", parsed.ok);
    if (!parsed.ok) {
      console.error(parsed.fieldErrors);
      throw new Error("파싱 실패");
    }

    check(
      "태그가 정규화·중복 제거된다",
      JSON.stringify(parsed.data.tags) === JSON.stringify(["ai", "검증"]),
      JSON.stringify(parsed.data.tags)
    );
    check(
      "readingTime 이 숫자가 된다",
      (parsed.data.detail as { readingTime?: number }).readingTime === 12
    );
    check(
      "authors 가 배열이 된다",
      JSON.stringify((parsed.data.detail as { authors?: string[] }).authors) ===
        JSON.stringify(["홍길동", "김철수"])
    );

    const created = await resourceWrite.create(actor, parsed.data);
    madeResources.push(created.id);
    check("자료가 만들어진다", Boolean(created.id), created.slug);
    /*
     * 처음엔 라틴 문자만 남겨서 「검증용 AI 자료」가 `-ai-` 가 됐습니다.
     * 한국어 제목이 대부분이므로 그 규칙은 거의 모든 제목을 망가뜨립니다.
     */
    check(
      "한글 제목이 slug 에 살아 있다",
      created.slug === "검증용-ai-자료",
      created.slug
    );

    // **상세 테이블까지 갔는가** — 이것이 「관통」의 증명이다
    const detail = await db.aiMaterial.findUnique({
      where: { resourceId: created.id },
    });
    check(
      "ai_materials 행이 생긴다",
      detail?.materialKind === "PAPER" && detail?.sourceName === "arXiv",
      `kind=${detail?.materialKind} source=${detail?.sourceName}`
    );
    check(
      "발행일이 Date 로 저장된다",
      detail?.publishedAt?.toISOString().slice(0, 10) === "2026-01-15",
      String(detail?.publishedAt)
    );

    // 태그 usage_count 가 갱신됐는가
    const tag = await db.tag.findUnique({ where: { slug: "ai" } });
    check(
      "태그 usage_count 가 갱신된다",
      (tag?.usageCount ?? 0) >= 1,
      `${tag?.usageCount}`
    );

    // 감사 로그가 같은 트랜잭션에 (DEC-043)
    const logs = await db.auditLog.count({
      where: { targetId: created.id, action: "RESOURCE_CREATE" },
    });
    check("감사 로그가 남는다", logs === 1, `${logs}건`);
  }

  console.log(
    "\n★ 목록·상세에서 보인다 (DoD: 등록하고 목록·검색·상세에서 확인)"
  );
  {
    const list = await resourceService.list(
      { sort: "recent" },
      { kind: "cursor", size: PAGE_SIZE },
      user.id
    );
    const mine = list.items.find((r) => r.id === madeResources[0]);
    check("목록에 나온다", Boolean(mine), `${list.items.length}건 중`);
    check(
      "카드가 타입 상세를 갖는다",
      mine?.detail.type === "AI_MATERIAL" &&
        (mine.detail as { materialKind?: string }).materialKind === "PAPER"
    );

    const found = await resourceService.list(
      { q: "검증용", sort: "recent" },
      { kind: "cursor", size: PAGE_SIZE },
      user.id
    );
    check(
      "검색으로 찾힌다",
      found.items.some((r) => r.id === madeResources[0])
    );

    /*
     * **본문 검색이 FTS 를 쓰는 이유입니다.** 전에는 `title contains` 뿐이라
     * 제목에 없는 말은 못 찾았습니다 — `search_vector` 와 GIN 인덱스가
     * 처음부터 있었는데 아무도 쓰지 않고 있었습니다.
     */
    const byBody = await resourceService.list(
      { q: "본문", sort: "recent" },
      { kind: "cursor", size: PAGE_SIZE },
      user.id
    );
    check(
      "제목에 없고 본문에만 있는 말로도 찾힌다",
      byBody.items.some((r) => r.id === madeResources[0]),
      `${byBody.items.length}건`
    );

    const detail = await resourceService.getBySlug(mine!.slug, user.id);
    check("상세가 본문을 싣는다", detail.body?.includes("## 제목") === true);
    check("상세가 태그를 싣는다", detail.tags.includes("ai"));
  }

  console.log("\n★ URL 정규화·중복 감지 (FR-RES-011)");
  {
    const a = resourceWrite.normalizeUrl(
      "https://www.Example.com/a/?utm_source=x&b=2&a=1#frag"
    );
    check(
      "www·추적파라미터·프래그먼트가 정리되고 쿼리가 정렬된다",
      a === "https://example.com/a?a=1&b=2",
      String(a)
    );
    check(
      "http 와 https 가 같은 값이 된다",
      resourceWrite.normalizeUrl("http://example.com/a/") ===
        resourceWrite.normalizeUrl("https://example.com/a"),
      String(resourceWrite.normalizeUrl("http://example.com/a/"))
    );
    check(
      "URL 이 아니면 undefined",
      resourceWrite.normalizeUrl("javascript:alert(1)") === undefined
    );

    const withUrl = parseResourceInput(
      formLike({ title: "URL 있는 자료", url: "https://example.com/paper" })
    );
    if (!withUrl.ok) throw new Error("파싱 실패");
    const r = await resourceWrite.create(actor, withUrl.data);
    madeResources.push(r.id);

    const dup = await resourceWrite.findDuplicate(
      "http://www.example.com/paper/?utm_campaign=z"
    );
    check(
      "다르게 쓴 같은 URL 을 중복으로 찾는다",
      dup?.id === r.id,
      dup?.title
    );

    /*
     * **화면이 「그대로 등록해도 됩니다」라고 말하니 실제로 돼야 합니다** (`DEC-047`).
     * 전에는 `url_normalized` 부분 유니크가 막아 `P2002` → 「처리 중 문제가
     * 발생했습니다」였고, 다시 시도해도 영원히 같았습니다.
     */
    const again = parseResourceInput(
      formLike({
        title: "같은 URL 다른 관점",
        url: "https://example.com/paper",
      })
    );
    if (!again.ok) throw new Error("파싱 실패");
    const second = await msg(async () => {
      const created = await resourceWrite.create(actor, again.data);
      madeResources.push(created.id);
    });
    check(
      "같은 URL 을 그대로 다시 등록할 수 있다",
      second === "(오류 없음)",
      second
    );
  }

  console.log("\n★ 수정 — 타입은 못 바꾸고, 남의 자료는 못 고친다");
  {
    const id = madeResources[0];
    const edit = parseResourceInput(
      formLike({ title: "수정된 제목", tags: "ai" })
    );
    if (!edit.ok) throw new Error("파싱 실패");
    await resourceWrite.update(actor, id, edit.data);
    const after = await db.resource.findUnique({ where: { id } });
    check("제목이 바뀐다", after?.title === "수정된 제목", after?.title);

    // 태그를 뺐으니 usage_count 가 줄어야 한다 (증감이 아니라 세어서 쓴다)
    const gone = await db.tag.findUnique({ where: { slug: "검증" } });
    const links = await db.resourceTag.count({
      where: { tagId: gone?.id ?? "", resourceId: id },
    });
    check("뺀 태그의 연결이 지워진다", links === 0);

    const typeChange = parseResourceInput(formLike({ type: "DEV_NOTE" }));
    check(
      "저장할 수 없는 타입은 zod 가 막는다",
      !typeChange.ok && JSON.stringify(typeChange.fieldErrors).includes("P5"),
      typeChange.ok ? "(통과됨)" : JSON.stringify(typeChange.fieldErrors)
    );

    const stranger = await mkUser("stranger");
    const denied = await msg(() =>
      resourceWrite.update(actorOf(stranger), id, edit.data)
    );
    check("남의 자료는 못 고친다", denied.includes("권한이 없습니다"), denied);
  }

  console.log("\n★ 북마크 — 정본은 bookmarks 행, 카운트는 세어서 쓴다");
  {
    const id = madeResources[0];
    const on = await resourceService.toggleBookmark(actor, id);
    check("북마크가 켜진다", on.bookmarked && on.bookmarkCount === 1);

    const listed = await resourceService.listBookmarked(user.id);
    check(
      "북마크 목록에 나온다",
      listed.items.some((r) => r.id === id)
    );

    const off = await resourceService.toggleBookmark(actor, id);
    check("다시 누르면 꺼진다", !off.bookmarked && off.bookmarkCount === 0);

    const row = await db.resource.findUnique({
      where: { id },
      select: { bookmarkCount: true },
    });
    check("표시용 캐시가 정본과 맞는다", row?.bookmarkCount === 0);
  }

  console.log("\n★ 삭제는 소프트 — 목록에서 사라지고 행은 남는다");
  {
    const id = madeResources[1];
    await resourceService.remove(actor, id);
    const row = await db.resource.findUnique({ where: { id } });
    check("행은 남는다", row !== null);
    check("deletedAt 이 찍힌다", row?.deletedAt !== null);

    const list = await resourceService.list(
      {},
      { kind: "cursor", size: 100 },
      user.id
    );
    check("목록에서 사라진다", !list.items.some((r) => r.id === id));

    const gone = await msg(() => resourceService.getBySlug(row!.slug));
    check("상세도 못 연다", gone.includes("찾을 수 없습니다"), gone);
  }

  console.log(
    "\n★ DEC-032 병합 — 관리자가 타입 노출을 끄면 사이드바에서 사라진다 (P4 DoD)"
  );
  {
    const before = await contentTypeService.navTypes();
    check(
      "기본값은 레지스트리를 따른다 (행이 없어도 보인다)",
      before.some((t) => t.code === "AI_MATERIAL"),
      `${before.length}종`
    );

    // 운영자가 껐다고 가정 — DB 행을 만든다
    await db.contentTypeSetting.upsert({
      where: { type: "AI_MATERIAL" },
      create: { type: "AI_MATERIAL", showInNav: false },
      update: { showInNav: false },
    });
    const hidden = await contentTypeService.navTypes();
    check(
      "showInNav 를 끄면 사이드바에서 빠진다",
      !hidden.some((t) => t.code === "AI_MATERIAL"),
      `${hidden.length}종`
    );

    // **비활성이면 showInNav 와 무관하게 빠져야 한다**
    await db.contentTypeSetting.update({
      where: { type: "AI_MATERIAL" },
      data: { showInNav: true, isActive: false },
    });
    const inactive = await contentTypeService.navTypes();
    check(
      "isActive 가 꺼지면 showInNav 가 켜져 있어도 빠진다",
      !inactive.some((t) => t.code === "AI_MATERIAL")
    );

    // 관리 화면은 꺼진 것도 보여야 한다 — 다시 켜려면 보여야 하니까
    const all = await contentTypeService.listSettings();
    check(
      "관리 화면 목록에는 꺼진 타입도 남는다",
      all.some((t) => t.code === "AI_MATERIAL" && !t.isActive)
    );

    await db.contentTypeSetting.delete({ where: { type: "AI_MATERIAL" } });
    const restored = await contentTypeService.navTypes();
    check(
      "행을 지우면 레지스트리 기본값으로 돌아온다",
      restored.some((t) => t.code === "AI_MATERIAL")
    );
  }

  console.log("\n★ 규격에 있는데 빠졌던 것 (FR-SRCH-003·004)");
  {
    const byBookmark = await resourceService.list(
      { sort: "bookmarked" },
      { kind: "cursor", size: PAGE_SIZE },
      user.id
    );
    check("북마크순 정렬이 동작한다", byBookmark.items.length > 0);

    const recent = await resourceService.list(
      { sort: "recent", days: 1 },
      { kind: "cursor", size: PAGE_SIZE },
      user.id
    );
    const old = await resourceService.list(
      { sort: "recent", days: 3650 },
      { kind: "cursor", size: PAGE_SIZE },
      user.id
    );
    check(
      "기간 필터가 좁힌다",
      recent.items.length <= old.items.length,
      `1일 ${recent.items.length} · 10년 ${old.items.length}`
    );
    // 이상한 값은 오류가 아니라 「전체 기간」이어야 한다 (URL 은 사람이 손으로 고친다)
    const junk = parseListQuery({ days: "abc", sort: "없는정렬" });
    check(
      "이상한 URL 값은 기본값으로 떨어진다",
      junk.days === undefined && junk.sort === "recent",
      `days=${junk.days} sort=${junk.sort}`
    );
  }

  console.log("\n★ 조회수 — 같은 사람이 세 번 열어도 한 번이다 (FR-RES-014)");
  {
    const target = madeResources[0];
    const viewer = await mkUser("viewer");
    const other = await mkUser("viewer2");
    const countOf = async () =>
      (
        await db.resource.findUniqueOrThrow({
          where: { id: target },
          select: { viewCount: true },
        })
      ).viewCount;

    // 이전 실행의 흔적을 지운다 — TTL 6시간이라 남아 있으면 첫 조회가 안 세어진다
    await redis.del(`view:${viewer.id}:${target}`, `view:${other.id}:${target}`);

    const base = await countOf();
    await resourceService.countView(target, viewer.id);
    check("처음 보면 는다", (await countOf()) === base + 1, `${base} → ${await countOf()}`);

    await resourceService.countView(target, viewer.id);
    await resourceService.countView(target, viewer.id);
    check(
      "같은 사람이 더 봐도 안 는다",
      (await countOf()) === base + 1,
      `${await countOf()}`
    );

    await resourceService.countView(target, other.id);
    check("다른 사람이 보면 는다", (await countOf()) === base + 2);

    /*
     * **동시 호출이 두 번 세면 안 됩니다.** 「읽고 없으면 쓴다」로 만들면
     * 둘 다 통과합니다 — 북마크 카운터에서 실측했던 lost update 와 같은 형태이고,
     * 단일 스레드 검증은 이것을 절대 못 봅니다.
     */
    const racer = await mkUser("viewer3");
    await redis.del(`view:${racer.id}:${target}`);
    const before = await countOf();
    await Promise.all(
      Array.from({ length: 5 }, () =>
        resourceService.countView(target, racer.id)
      )
    );
    check(
      "동시 5회도 1만 는다",
      (await countOf()) === before + 1,
      `${before} → ${await countOf()}`
    );
  }

  console.log("\n★ 검색 후보 상한 — 잘리면 «잘렸다고 말한다» (DEC-048)");
  {
    const normal = await resourceService.list(
      { q: "검증용", sort: "recent" },
      { kind: "cursor", size: PAGE_SIZE },
      user.id
    );
    check(
      "상한에 안 닿으면 신호가 없다",
      !normal.searchTruncated,
      `truncated=${normal.searchTruncated}`
    );

    /*
     * **같은 질의를 두 번 하면 같은 결과여야 합니다.**
     * 전에는 `ORDER BY rank DESC` 뿐이라 `title ILIKE` 로만 걸린 행이 전부
     * rank 0 동점이었고, Postgres 는 동점을 임의 순서로 냅니다 —
     * 즉 **같은 검색이 요청마다 다른 결과를 낼 수 있었습니다.**
     * `, id DESC` 가 그것을 고정합니다.
     */
    const runs = await Promise.all(
      Array.from({ length: 4 }, () =>
        resourceService.list(
          { q: "자료", sort: "recent" },
          { kind: "cursor", size: PAGE_SIZE },
          user.id
        )
      )
    );
    const shapes = runs.map((r) => r.items.map((i) => i.id).join(","));
    check(
      "같은 질의를 네 번 해도 결과가 같다",
      new Set(shapes).size === 1,
      `서로 다른 결과 ${new Set(shapes).size}가지`
    );

    /*
     * **신호가 «켜지는» 것까지 봐야 합니다.**
     * 상한을 넘기지 않은 검색만 확인하면 「`truncated` 가 늘 `false` 인 코드」도
     * 통과합니다 — `check-deps` 에서 겪은 「매치하는 파일이 하나도 없어도 0건」과
     * 같은 함정입니다. 그래서 실제로 2,001건을 만들어 던져 봅니다.
     */
    const MARK = "상한시험어";
    const bulkAuthor = await mkUser("bulk");
    const bulkIds: string[] = [];
    for (let off = 0; off < 2001; off += 500) {
      const size = Math.min(500, 2001 - off);
      const rows = Array.from({ length: size }, (_, i) => {
        const n = off + i;
        const id = `vlim${n.toString().padStart(6, "0")}${randomBytes(4).toString("hex")}`;
        bulkIds.push(id);
        return {
          id,
          type: "AI_MATERIAL" as const,
          slug: `vlim-${n}-${randomBytes(3).toString("hex")}`,
          title: `${MARK} ${n}`,
          authorId: bulkAuthor.id,
        };
      });
      await db.resource.createMany({ data: rows, skipDuplicates: true });
    }
    try {
      const hit = await resourceService.list(
        { q: MARK, sort: "recent" },
        { kind: "cursor", size: PAGE_SIZE },
        user.id
      );
      check(
        "2,001건이면 상한에 닿았다고 «말한다»",
        hit.searchTruncated === true,
        `truncated=${hit.searchTruncated}`
      );

      // 잘려도 페이지는 정상이어야 한다 — 신호는 경고이지 오류가 아니다
      check(
        "잘려도 결과는 나온다",
        hit.items.length === PAGE_SIZE,
        `${hit.items.length}건`
      );

      const twice = await Promise.all([
        resourceService.list(
          { q: MARK, sort: "recent" },
          { kind: "cursor", size: PAGE_SIZE },
          user.id
        ),
        resourceService.list(
          { q: MARK, sort: "recent" },
          { kind: "cursor", size: PAGE_SIZE },
          user.id
        ),
      ]);
      check(
        "상한에 닿아도 같은 질의는 같은 결과",
        twice[0].items.map((i) => i.id).join(",") ===
          twice[1].items.map((i) => i.id).join(","),
        "타이브레이커 `id DESC` 가 동점 순서를 고정한다"
      );

      // 한 건 줄이면 신호가 꺼진다 — 경계가 맞는지 본다
      await db.resource.delete({ where: { id: bulkIds[0] } });
      bulkIds.shift();
      const edge = await resourceService.list(
        { q: MARK, sort: "recent" },
        { kind: "cursor", size: PAGE_SIZE },
        user.id
      );
      check(
        "정확히 2,000건이면 신호가 꺼진다",
        edge.searchTruncated === false,
        `truncated=${edge.searchTruncated}`
      );
    } finally {
      await db.resource.deleteMany({ where: { id: { in: bulkIds } } });
    }
  }

  console.log("\n★ 초안은 작성자·EDITOR 만 본다 (M3)");
  {
    const draftAuthor = await mkUser("draft");
    const stranger = await mkUser("draft-stranger");
    const p = parseResourceInput(formLike({ title: "초안 자료", url: "" }));
    if (!p.ok) throw new Error("파싱 실패");
    const d = await resourceWrite.create(actorOf(draftAuthor), p.data);
    madeResources.push(d.id);
    await db.resource.update({
      where: { id: d.id },
      data: { status: "DRAFT" },
    });
    const row = await db.resource.findUniqueOrThrow({ where: { id: d.id } });

    const asAuthor = await resourceService.getBySlug(
      row.slug,
      draftAuthor.id,
      "MEMBER"
    );
    check("작성자는 자기 초안을 본다", asAuthor.id === d.id);
    check(
      "DTO 가 실제 status 를 싣는다",
      asAuthor.status === "DRAFT",
      asAuthor.status
    );

    const denied = await msg(() =>
      resourceService.getBySlug(row.slug, stranger.id, "MEMBER")
    );
    check(
      "남은 초안을 URL 로도 못 연다",
      denied.includes("찾을 수 없습니다"),
      denied
    );
    const asEditor = await resourceService.getBySlug(
      row.slug,
      stranger.id,
      "EDITOR"
    );
    check("EDITOR 는 초안을 본다", asEditor.id === d.id);
  }

  console.log("\n★ 동시 실행 — 단일 스레드 검증이 놓쳤던 것들");
  {
    /*
     * **리뷰가 여기서 셋을 찾았습니다.** 이 스크립트가 `Promise.all` 없이
     * 순차로만 돌았기 때문에 태그 upsert 경합·카운터 lost update·slug 충돌이
     * 전부 통과했습니다. 「관통했다」는 말이 **단일 스레드에서만 참**이었습니다.
     */
    const u = await mkUser("race");
    const a = actorOf(u);

    // ① 같은 제목 동시 등록 — slug 유니크 충돌
    const same = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        (async () => {
          const p = parseResourceInput(
            formLike({ title: "동시 제목", tags: "동시태그", url: "" })
          );
          if (!p.ok) throw new Error("파싱 실패");
          return resourceWrite.create(a, p.data);
        })()
      )
    );
    const created = same.filter((r) => r.status === "fulfilled");
    for (const r of created) {
      if (r.status === "fulfilled") madeResources.push(r.value.id);
    }
    check(
      "같은 제목 4건 동시 등록이 전부 성공한다",
      created.length === 4,
      `${created.length}/4` +
        (same.find((r) => r.status === "rejected")
          ? ` · ${String((same.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).slice(0, 80)}`
          : "")
    );
    const slugs = new Set(
      created.map(
        (r) => (r as PromiseFulfilledResult<{ slug: string }>).value.slug
      )
    );
    check(
      "slug 가 서로 다르다",
      slugs.size === created.length,
      `${slugs.size}종`
    );

    // ② 같은 태그를 동시에 — usage_count lost update
    const tag = await db.tag.findUnique({ where: { slug: "동시태그" } });
    const links = await db.resourceTag.count({
      where: { tagId: tag?.id ?? "" },
    });
    check(
      "태그 usage_count 가 실제 연결 수와 맞는다",
      tag?.usageCount === links,
      `usage=${tag?.usageCount} 실제=${links}`
    );

    // ③ 같은 자료를 동시에 북마크 — bookmark_count lost update
    const target = madeResources[0];
    const voters = await Promise.all(
      Array.from({ length: 5 }, (_, i) => mkUser(`voter${i}`))
    );
    await Promise.all(
      voters.map((v) => resourceService.toggleBookmark(actorOf(v), target))
    );
    const row = await db.resource.findUnique({
      where: { id: target },
      select: { bookmarkCount: true },
    });
    const actual = await db.bookmark.count({ where: { resourceId: target } });
    check(
      "bookmark_count 가 실제 북마크 수와 맞는다",
      row?.bookmarkCount === actual,
      `캐시=${row?.bookmarkCount} 실제=${actual}`
    );

    // ④ 같은 사람이 같은 자료를 동시에 두 번 — 캐시가 두 번 오르지 않아야
    const dbl = voters[0];
    await Promise.all([
      resourceService.toggleBookmark(actorOf(dbl), target),
      resourceService.toggleBookmark(actorOf(dbl), target),
    ]);
    const row2 = await db.resource.findUnique({
      where: { id: target },
      select: { bookmarkCount: true },
    });
    const actual2 = await db.bookmark.count({ where: { resourceId: target } });
    check(
      "같은 사람이 동시에 두 번 눌러도 캐시가 정본과 맞는다",
      row2?.bookmarkCount === actual2,
      `캐시=${row2?.bookmarkCount} 실제=${actual2}`
    );
  }

  // ── 정리 ────────────────────────────────────────────
  await db.auditLog.deleteMany({ where: { actorId: { in: made } } });
  await db.tag.deleteMany({
    where: { slug: { in: ["ai", "검증", "동시태그"] } },
  });
  // 시드 값으로 되돌린다 — 검증이 DB 를 바꿔 놓고 끝나면 안 된다
  await db.contentTypeSetting.deleteMany({ where: { type: "AI_MATERIAL" } });
  await db.resourceTag.deleteMany({
    where: { resourceId: { in: madeResources } },
  });
  await db.bookmark.deleteMany({ where: { userId: { in: made } } });
  await db.aiMaterial.deleteMany({
    where: { resourceId: { in: madeResources } },
  });
  await db.resource.deleteMany({ where: { id: { in: madeResources } } });
  await db.user.deleteMany({ where: { id: { in: made } } });
  if (made.length) await redis.del(...made.map((id) => `user:gen:${id}`));

  console.log(`\n합계: 통과 ${pass} · 실패 ${fail}`);
  await redis.quit();
  await db.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

run().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
