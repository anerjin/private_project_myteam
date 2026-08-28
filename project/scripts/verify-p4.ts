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
import { PAGE_SIZE } from "@/features/resources/list.schema";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { redis } from "@/lib/redis";
import type { Actor } from "@/server/auth/actor";
import { hashPassword } from "@/server/auth/password";
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

  // ── 정리 ────────────────────────────────────────────
  await db.auditLog.deleteMany({ where: { actorId: { in: made } } });
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
