/**
 * `P8` 검증 — 관리자 전체 (`M5`).
 *
 *   npm run verify:p8   (`npm run dev` 가 떠 있어야 합니다)
 *
 * ## 두 층으로 봅니다
 *
 * ① **service** — 되살리기·병합·설정 저장처럼 «무엇이 일어나는가»
 * ② **화면(HTTP)** — 그 기능에 **닿을 수 있는가**
 *
 * ②가 없으면 안 됩니다. `P8` 이전 상태가 정확히 그것이었습니다: service 는
 * 있는데 화면의 버튼이 `disabled` 라 아무도 부를 수 없는 기능들.
 * 그래서 이 스크립트는 **「눌러도 안 되는 버튼이 남아 있지 않은가」**를
 * 화면 HTML 에서 직접 봅니다.
 */
import { randomBytes } from "node:crypto";

import { parseResourceInput } from "@/features/resources/form.schema";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/server/auth/actor";
import { hashPassword } from "@/server/auth/password";
import { issue as issueSession } from "@/server/auth/session";
import * as audit from "@/server/services/audit.service";
import * as categoryService from "@/server/services/category.service";
import * as collectionService from "@/server/services/collection.service";
import * as contentTypeService from "@/server/services/content-type.service";
import * as maintenanceService from "@/server/services/maintenance.service";
import * as memberService from "@/server/services/member.service";
import * as resourceService from "@/server/services/resource.service";
import * as resourceWrite from "@/server/services/resource.write";
import * as settingsService from "@/server/services/settings.service";
import * as storageService from "@/server/services/storage.service";
import * as tagService from "@/server/services/tag.service";
import * as userService from "@/server/services/user.service";

const BASE = "http://localhost:3100";
const COOKIE = process.env.SESSION_COOKIE_NAME || "qb_session";

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
const madeCategories: string[] = [];
const madeTags: string[] = [];
const madeCollections: string[] = [];

async function mkUser(tag: string, role: "MEMBER" | "EDITOR" | "ADMIN") {
  const u = await db.user.create({
    data: {
      username: `vp8_${tag}_${randomBytes(4).toString("hex")}`,
      passwordHash: await hashPassword("Verify!12345"),
      name: `P8검증-${tag}`,
      status: "ACTIVE",
      role,
    },
    select: { id: true, username: true, role: true, name: true },
  });
  madeUsers.push(u.id);
  return u;
}

const actorOf = (u: {
  id: string;
  username: string;
  role: string;
}): Actor => ({
  id: u.id,
  username: u.username,
  role: u.role as Actor["role"],
  via: "WEB",
});

async function cookieFor(userId: string): Promise<string> {
  const { token } = await issueSession(userId, { userAgent: "verify-p8" });
  return `${COOKIE}=${token}`;
}

async function get(path: string, cookie: string) {
  // dev 서버의 첫 컴파일이 500 을 내는 일이 있습니다 (`verify-p6` 와 같은 이유)
  for (let i = 0; i < 2; i++) {
    const res = await fetch(BASE + path, { headers: { cookie }, redirect: "manual" });
    if (res.status !== 500) {
      const body = res.status === 200 ? await res.text() : "";
      return { status: res.status, body: body.replaceAll("<!-- -->", "") };
    }
  }
  return { status: 500, body: "" };
}

/** 오류 문구를 문자열로 — 「막혔다」가 아니라 «무엇이라고 말하는가»를 본다 */
async function msg(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "(예외 없음)";
  } catch (e) {
    return e instanceof AppError ? e.message : String(e);
  }
}

async function run() {
  const admin = await mkUser("admin", "ADMIN");
  const editor = await mkUser("editor", "EDITOR");
  const member = await mkUser("member", "MEMBER");
  const adminActor = actorOf(admin);
  const editorActor = actorOf(editor);
  const memberActor = actorOf(member);
  const adminCookie = await cookieFor(admin.id);
  const editorCookie = await cookieFor(editor.id);

  /* ── 회원 (FR-ADM-003·005·006·008·009·016) ───────────────────────── */
  console.log("\n★ 강제 탈퇴 (FR-ADM-008)");
  {
    const victim = await mkUser("victim", "MEMBER");
    const vCookie = await cookieFor(victim.id);

    // 탈퇴 전에는 로그인이 살아 있다
    const before = await get("/dashboard", vCookie);
    check("탈퇴 전에는 화면이 열린다", before.status === 200, `${before.status}`);

    await memberService.transition(adminActor, victim.id, {
      kind: "WITHDRAW",
      reason: "P8 검증 — 강제 탈퇴 경로 확인",
    });

    const row = await db.user.findUniqueOrThrow({
      where: { id: victim.id },
      select: { status: true, statusReason: true },
    });
    check("상태가 WITHDRAWN 이다", row.status === "WITHDRAWN", row.status);
    check("사유가 남는다", (row.statusReason ?? "").includes("P8 검증"));

    /*
     * **모든 전이가 세션을 끊습니다** (`DEC-036`). 탈퇴만 예외로 두면
     * 「계정은 죽었는데 열려 있던 탭은 계속 도는」 상태가 됩니다.
     */
    const after = await get("/dashboard", vCookie);
    check("세션이 끊겨 로그인으로 간다", after.status !== 200, `${after.status}`);

    const log = await db.auditLog.findFirst({
      where: { targetId: victim.id, action: "USER_WITHDRAW" },
      select: { summary: true },
    });
    check("감사 로그에 남는다", Boolean(log), log?.summary ?? "");

    // 되돌리는 전이가 없다 — 되살릴 길이 있는 상태는 애초에 대상이 아니다
    const again = await msg(() =>
      memberService.transition(adminActor, victim.id, {
        kind: "WITHDRAW",
        reason: "두 번째 시도입니다 확인용",
      })
    );
    check("이미 탈퇴한 회원은 다시 못 한다", again.includes("할 수 없는 상태"), again);
  }

  console.log("\n★ 마지막 관리자 보호가 «탈퇴»에서도 (FR-ADM-009)");
  {
    /*
     * 시드 관리자가 이미 있으므로 이 검증의 관리자는 「마지막」이 아닙니다.
     * 그래서 **일반식이 도는지**를 봅니다 — `removesActiveAdmin` 은
     * `spec.next !== "ACTIVE"` 로 판정하므로 탈퇴도 그 그물에 걸립니다.
     */
    const solo = await mkUser("solo", "ADMIN");
    const activeAdmins = await db.user.count({
      where: { role: "ADMIN", status: "ACTIVE" },
    });
    check("활성 관리자가 둘 이상이라 탈퇴가 통과한다", activeAdmins >= 2, `${activeAdmins}명`);
    await memberService.transition(adminActor, solo.id, {
      kind: "WITHDRAW",
      reason: "마지막 관리자 판정 경로 확인용입니다",
    });
    const s = await db.user.findUniqueOrThrow({
      where: { id: solo.id },
      select: { status: true },
    });
    check("관리자도 탈퇴된다", s.status === "WITHDRAWN");
  }

  console.log("\n★ 회원 상세가 실제로 보여준다 (FR-ADM-003)");
  {
    const page = await get(`/admin/members/${member.id}`, adminCookie);
    check("관리자로 열린다", page.status === 200, `${page.status}`);
    for (const label of ["활동 내역", "로그인 이력", "API 키", "상태 변경 이력"]) {
      check(`«${label}» 카드가 있다`, page.body.includes(label));
    }
    /*
     * **`disabled` 장식 버튼이 없어야 합니다.** `P3` 가 여기서 걷어낸 것이
     * 다시 들어오지 않았는지 봅니다 — 이 화면의 버튼은 전부 배선돼 있습니다.
     */
    check(
      "처리 버튼이 보인다",
      page.body.includes("더 보기"),
      "정지·역할·API 키 폐기·탈퇴가 이 메뉴 안에 있다"
    );

    const activity = await memberService.activityFor(member.id);
    check(
      "활동 숫자를 센다",
      typeof activity.resources === "number" && typeof activity.apiKeys === "number"
    );
  }

  console.log("\n★ 회원 API 키 강제 폐기 (FR-ADM-016)");
  {
    const apiKeyService = await import("@/server/services/api-key.service");
    const k1 = await apiKeyService.issue(actorOf(member), "키1", ["resources:read"]);
    await apiKeyService.issue(actorOf(member), "키2", ["resources:read"]);

    const n = await apiKeyService.revokeAllKeysFor(adminActor, member.id);
    check("두 개를 한 번에 폐기한다", n === 2, `${n}개`);

    const verify = await import("@/server/auth/api-key");
    const why = await msg(() => verify.verifyKey(k1.plaintext));
    check("폐기된 키는 즉시 막힌다", why.includes("폐기"), why);

    const log = await db.auditLog.findFirst({
      where: { targetId: member.id, action: "APIKEY_REVOKE" },
      select: { diff: true },
    });
    check("무엇을 지웠는지 남는다", Boolean(log), JSON.stringify(log?.diff ?? null));
  }

  /* ── 자료 관리 · 휴지통 (FR-ADM-010·011, FR-RES-008·009) ─────────── */
  console.log("\n★ 휴지통 — 되살리기와 영구 삭제 (FR-ADM-011)");
  {
    const input = parseResourceInput({
      type: "DEV_NOTE",
      title: "P8 휴지통 검증 자료",
      noteKind: "TIP",
      body: "삭제했다 되살립니다.",
    });
    if (!input.ok) throw new Error("입력 스키마 실패");
    const created = await resourceWrite.create(editorActor, input.data);
    madeResources.push(created.id);

    await resourceService.remove(editorActor, created.id);
    const trashed = await db.resource.findUniqueOrThrow({
      where: { id: created.id },
      select: { deletedAt: true },
    });
    check("삭제하면 휴지통으로", trashed.deletedAt !== null);

    // 휴지통 탭이 처리 버튼을 «그린다»
    const trash = await get("/admin/resources?tab=trash", adminCookie);
    check("휴지통 탭이 열린다", trash.status === 200, `${trash.status}`);
    check("복구 버튼이 있다", trash.body.includes("복구"));
    check("영구 삭제 버튼이 있다", trash.body.includes("영구 삭제"));
    check(
      "「준비 중」 문구가 사라졌다",
      !trash.body.includes("삭제·복구는 준비 중입니다"),
      "이 문구가 남아 있으면 화면이 옛 상태다"
    );

    await resourceService.restore(editorActor, created.id);
    const back = await db.resource.findUniqueOrThrow({
      where: { id: created.id },
      select: { deletedAt: true },
    });
    check("되살아난다", back.deletedAt === null);

    const restoreLog = await db.auditLog.findFirst({
      where: { targetId: created.id, action: "RESOURCE_RESTORE" },
    });
    check("복구가 감사 로그에 남는다", Boolean(restoreLog));

    /*
     * **영구 삭제는 «휴지통에 있을 때만»** — 살아 있는 자료를 바로 지우면
     * 30일 유예가 있는 이유가 사라집니다.
     */
    const tooSoon = await msg(() => resourceService.purge(adminActor, created.id));
    check("살아 있는 자료는 영구 삭제 못 한다", tooSoon.includes("먼저 삭제"), tooSoon);

    await resourceService.remove(editorActor, created.id);
    const asEditor = await msg(() => resourceService.purge(editorActor, created.id));
    check("EDITOR 는 영구 삭제 못 한다", asEditor.includes("관리자만"), asEditor);

    await resourceService.purge(adminActor, created.id);
    const gone = await db.resource.findUnique({ where: { id: created.id } });
    check("행이 사라진다", gone === null);
    madeResources.pop();

    const purgeLog = await db.auditLog.findFirst({
      where: { targetId: created.id, action: "RESOURCE_PURGE" },
      select: { summary: true },
    });
    /*
     * **제목이 스냅샷으로 남습니다.** 행이 사라졌으므로 이 문구가 「무엇이
     * 지워졌는가」의 유일한 답입니다.
     */
    check(
      "지워진 제목이 감사 로그에 남는다",
      (purgeLog?.summary ?? "").includes("P8 휴지통 검증 자료"),
      purgeLog?.summary ?? ""
    );
  }

  /* ── 분류 (FR-ADM-012) ──────────────────────────────────────────── */
  console.log("\n★ 카테고리 관리 (FR-ADM-012)");
  {
    const top = `vp8top${randomBytes(2).toString("hex")}`;
    const sub = `vp8sub${randomBytes(2).toString("hex")}`;
    const other = `vp8oth${randomBytes(2).toString("hex")}`;
    madeCategories.push(top, sub, other);

    await categoryService.create(adminActor, { name: "P8 대분류", slug: top });
    await categoryService.create(adminActor, {
      name: "P8 하위",
      slug: sub,
      parentSlug: top,
    });
    await categoryService.create(adminActor, { name: "P8 다른곳", slug: other });

    // 깊이 2단계 — **하위의 하위는 못 만듭니다**
    const deep = await msg(() =>
      categoryService.create(adminActor, {
        name: "너무 깊음",
        slug: `${sub}-x`,
        parentSlug: sub,
      })
    );
    check("3단계는 막힌다", deep.includes("2단계"), deep);

    const dup = await msg(() =>
      categoryService.create(adminActor, { name: "중복", slug: top })
    );
    check("같은 주소는 막힌다", dup.includes("이미 있는 주소"), dup);

    // 자료를 하위분류에 넣어 둔다
    const input = parseResourceInput({
      type: "DEV_NOTE",
      title: "P8 분류 이관 검증",
      noteKind: "TIP",
      category: sub,
    });
    if (!input.ok) throw new Error("입력 스키마 실패");
    const res = await resourceWrite.create(editorActor, input.data);
    madeResources.push(res.id);

    const withChild = await msg(() =>
      categoryService.remove(adminActor, top, null)
    );
    check("하위가 있으면 못 지운다", withChild.includes("하위분류"), withChild);

    const { moved } = await categoryService.remove(adminActor, sub, other);
    check("자료를 옮기고 지운다", moved === 1, `${moved}건 이관`);
    madeCategories.splice(madeCategories.indexOf(sub), 1);

    const movedRow = await db.resource.findUniqueOrThrow({
      where: { id: res.id },
      select: { category: { select: { slug: true } } },
    });
    check("자료가 새 분류로 갔다", movedRow.category?.slug === other, movedRow.category?.slug ?? "");

    // 순서 — 형제 전체를 받는다
    const tree = await categoryService.listAllForAdmin();
    const slugs = tree.map((c) => c.slug);
    await categoryService.reorder(adminActor, [...slugs].reverse());
    const after = await categoryService.listAllForAdmin();
    check(
      "순서가 뒤집힌다",
      after[0]?.slug === slugs[slugs.length - 1],
      `${after[0]?.slug}`
    );
    await categoryService.reorder(adminActor, slugs);

    // 비활성 — **관리 화면에는 남아야** 다시 켤 수 있다
    await categoryService.update(adminActor, other, { isActive: false });
    const adminTree = await categoryService.listAllForAdmin();
    const userTree = await categoryService.listTree();
    check(
      "끈 분류가 관리 화면에는 남는다",
      adminTree.some((c) => c.slug === other),
      "안 남으면 다시 켤 방법이 없다"
    );
    check(
      "사용자 트리에서는 사라진다",
      !userTree.some((c) => c.slug === other)
    );
    await categoryService.update(adminActor, other, { isActive: true });

    const noPerm = await msg(() =>
      categoryService.create(memberActor, { name: "권한없음", slug: "vp8-nope" })
    );
    check("MEMBER 는 못 만든다", noPerm.includes("권한이 없습니다"), noPerm);
  }

  /* ── 태그 (FR-ADM-013, FR-SRCH-007) ─────────────────────────────── */
  console.log("\n★ 태그 관리 · 자동완성 (FR-ADM-013 · FR-SRCH-007)");
  {
    const a = `vp8ragx${randomBytes(2).toString("hex")}`;
    const b = `vp8ragy${randomBytes(2).toString("hex")}`;
    madeTags.push(a, b);

    const mk = async (title: string, tags: string) => {
      const input = parseResourceInput({
        type: "DEV_NOTE",
        title,
        noteKind: "TIP",
        tags,
      });
      if (!input.ok) throw new Error("입력 스키마 실패");
      const r = await resourceWrite.create(editorActor, input.data);
      madeResources.push(r.id);
      return r;
    };

    await mk("P8 태그 검증 하나", a);
    // **둘 다 붙은 자료** — 병합할 때 유니크 위반이 나는 자리입니다
    await mk("P8 태그 검증 둘", `${a}, ${b}`);
    await mk("P8 태그 검증 셋", b);

    const suggested = await tagService.suggest(a.slice(0, 6));
    check("자동완성이 후보를 준다", suggested.some((t) => t.slug === a), a);

    /*
     * **이미 고른 것을 빼도 검색어가 살아 있어야 합니다.** 처음 구현에서
     * `slug` 키를 두 번 펼쳐 **뒤엣것이 앞을 덮어썼고**, 그 순간 검색어가
     * 사라져 «전체 태그»가 후보로 나왔습니다.
     */
    const excluded = await tagService.suggest(a.slice(0, 6), [a]);
    check(
      "고른 태그를 빼도 검색어가 유지된다",
      excluded.every((t) => t.slug.includes(a.slice(0, 6))),
      excluded.map((t) => t.slug).join(",")
    );

    const { moved, merged } = await tagService.merge(adminActor, a, b);
    check("겹치는 자료를 버리고 옮긴다", moved === 1 && merged === 1, `이동 ${moved} · 중복 ${merged}`);

    const gone = await db.tag.findUnique({ where: { slug: a } });
    check("합친 태그는 사라진다", gone === null);

    const dst = await db.tag.findUniqueOrThrow({
      where: { slug: b },
      select: { usageCount: true, _count: { select: { resources: true } } },
    });
    check(
      "사용 수를 다시 세어 맞춘다",
      dst.usageCount === dst._count.resources && dst.usageCount === 3,
      `캐시 ${dst.usageCount} · 실제 ${dst._count.resources}`
    );
    madeTags.splice(madeTags.indexOf(a), 1);

    // 캐시를 일부러 어긋내고 다시 세기
    await db.tag.update({ where: { slug: b }, data: { usageCount: 999 } });
    const { fixed } = await tagService.recount(adminActor);
    check("어긋난 캐시를 정정한다", fixed >= 1, `${fixed}개`);
    const fixedRow = await db.tag.findUniqueOrThrow({ where: { slug: b } });
    check("다시 맞는다", fixedRow.usageCount === 3, `${fixedRow.usageCount}`);

    // 이름 변경
    const renamed = `${b}-r`;
    await tagService.rename(adminActor, b, { slug: renamed, label: renamed });
    madeTags.splice(madeTags.indexOf(b), 1, renamed);
    const r2 = await db.tag.findUnique({ where: { slug: renamed } });
    check("이름이 바뀐다", r2 !== null);

    // 안 쓰는 태그 정리
    const orphan = `vp8orphan${randomBytes(2).toString("hex")}`;
    await db.tag.create({ data: { slug: orphan, label: orphan } });
    const unusedBefore = await tagService.countUnused();
    check("안 쓰는 태그를 센다", unusedBefore >= 1, `${unusedBefore}개`);
    const { removed } = await tagService.cleanup(adminActor);
    check("정리된다", removed.includes(orphan), removed.join(","));
  }

  /* ── 콘텐츠 타입 (FR-ADM-014) ───────────────────────────────────── */
  console.log("\n★ 콘텐츠 타입 설정 (FR-ADM-014)");
  {
    const before = await contentTypeService.listSettings();
    const target = before.find((t) => t.code === "PROMPT")!;

    const asEditor = await msg(() =>
      contentTypeService.updateSettings(
        editorActor,
        before.map((t) => ({ code: t.code, isActive: t.isActive, showInNav: t.showInNav }))
      )
    );
    check("EDITOR 는 못 바꾼다", asEditor.includes("관리자만"), asEditor);

    await contentTypeService.updateSettings(
      adminActor,
      before.map((t) => ({
        code: t.code,
        isActive: t.code === "PROMPT" ? false : t.isActive,
        // **비활성인데 메뉴에 있다**를 일부러 보냅니다 — 서버가 정리해야 합니다
        showInNav: true,
      }))
    );

    const after = await contentTypeService.listSettings();
    const now = after.find((t) => t.code === "PROMPT")!;
    check("비활성이 저장된다", now.isActive === false);
    check(
      "비활성이면 사이드바도 꺼진다",
      now.showInNav === false,
      "모순된 조합을 저장하면 안 된다"
    );

    const nav = await contentTypeService.navTypes();
    check("메뉴에서 빠진다", !nav.some((t) => t.code === "PROMPT"));

    // 되돌린다
    await contentTypeService.updateSettings(
      adminActor,
      before.map((t) => ({
        code: t.code,
        isActive: t.isActive,
        showInNav: t.showInNav,
      }))
    );
    const restored = await contentTypeService.listSettings();
    check(
      "되돌아온다",
      restored.find((t) => t.code === "PROMPT")?.isActive === target.isActive
    );
  }

  /* ── 시스템 설정 (FR-ADM-015) ───────────────────────────────────── */
  console.log("\n★ 시스템 설정 — 바꾼 값이 «읽는 쪽»에 닿는다 (FR-ADM-015)");
  {
    const rows = await settingsService.getAll();
    check("네 항목이 온다", rows.length === 4, `${rows.length}개`);

    const upload = rows.find((r) => r.key === "upload.maxMb")!;
    check("건드리기 전에는 기본값이라고 말한다", upload.overridden === false);

    const asEditor = await msg(() =>
      settingsService.set(editorActor, "upload.maxMb", 77)
    );
    check("EDITOR 는 못 바꾼다", asEditor.includes("관리자만"), asEditor);

    const bad = await msg(() => settingsService.set(adminActor, "upload.maxMb", 0));
    check("범위를 벗어난 값은 막는다", bad.includes("넣을 수 없는 값"), bad);

    await settingsService.set(adminActor, "upload.maxMb", 77);
    /*
     * **읽는 쪽이 그 값을 봐야 합니다.** 저장만 되고 `file.service` 가
     * `.env` 상수를 계속 보면, 설정 화면은 거짓말을 하는 것입니다.
     */
    const bytes = await settingsService.maxUploadBytes();
    check("업로드 상한이 바뀐다", bytes === 77 * 1024 * 1024, `${bytes}`);

    const after = await settingsService.getAll();
    check(
      "이제 «이 화면에서 정한 값»이라고 말한다",
      after.find((r) => r.key === "upload.maxMb")?.overridden === true
    );

    const log = await db.auditLog.findFirst({
      where: { targetId: "upload.maxMb", action: "SETTING_UPDATE" },
      select: { diff: true },
    });
    check("변경 전·후가 남는다", Boolean(log), JSON.stringify(log?.diff ?? null));

    // 디스크 임계치도 같은 경로
    await settingsService.set(adminActor, "disk.minFreeGb", 3);
    const usage = await storageService.usage();
    check("디스크 임계치가 반영된다", usage.disk.minFreeGb === 3, `${usage.disk.minFreeGb}`);

    // 화면이 그 값을 보여준다
    const page = await get("/admin/settings", adminCookie);
    check("설정 화면이 열린다", page.status === 200, `${page.status}`);
    check("바꾼 값이 화면에 있다", page.body.includes("77"), "저장한 77MB");
    check(
      "「준비 중」 문구가 없다",
      !page.body.includes("변경은 준비 중입니다"),
      "이 문구가 남아 있으면 화면이 옛 상태다"
    );

    await db.systemSetting.deleteMany({
      where: { key: { in: ["upload.maxMb", "disk.minFreeGb"] } },
    });
  }

  /* ── 감사 로그 필터 (FR-AUDIT-002) ──────────────────────────────── */
  console.log("\n★ 감사 로그 필터 (FR-AUDIT-002)");
  {
    const all = await audit.list({ page: 1, size: 5 });
    check("목록이 온다", all.items.length > 0, `총 ${all.total}건`);

    const byActor = await audit.list({
      page: 1,
      size: 50,
      filter: { actor: admin.username },
    });
    check(
      "행위자로 거른다",
      byActor.items.length > 0 &&
        byActor.items.every((l) => l.actorUsername === admin.username),
      `${byActor.total}건`
    );
    check("총 건수도 필터를 본다", byActor.total < all.total, `${byActor.total} < ${all.total}`);

    const byAction = await audit.list({
      page: 1,
      size: 50,
      filter: { action: "USER_WITHDRAW" },
    });
    check(
      "행위로 거른다",
      byAction.items.every((l) => l.action === "USER_WITHDRAW"),
      `${byAction.total}건`
    );

    /*
     * **오늘 하루가 통째로 빠지면 안 됩니다.** `to` 를 그날 00:00 으로 읽으면
     * 방금 만든 기록이 안 나옵니다 — 날짜 한 칸에 0건이 나오는 필터는
     * 없는 것보다 나쁩니다.
     */
    const today = new Date().toISOString().slice(0, 10);
    const byDate = await audit.list({
      page: 1,
      size: 5,
      filter: { from: today, to: today },
    });
    check("오늘 하루가 통째로 포함된다", byDate.total > 0, `${byDate.total}건`);

    const actors = await audit.listActors();
    check("행위자 선택지가 있다", actors.includes(admin.username), `${actors.length}명`);

    const page = await get(
      `/admin/audit-logs?actor=${admin.username}&action=USER_WITHDRAW`,
      adminCookie
    );
    check("필터가 걸린 화면이 열린다", page.status === 200, `${page.status}`);
    check("필터 UI 가 있다", page.body.includes("행위자") && page.body.includes("시작일"));

    // 못 알아듣는 값은 «버리고» 나머지로 거른다 — 오류 화면이 아니다
    const junk = await get("/admin/audit-logs?action=NOPE&from=어제", adminCookie);
    check("이상한 필터에도 화면이 열린다", junk.status === 200, `${junk.status}`);
  }

  /* ── 대시보드 (FR-ADM-001, FR-FILE-006) ─────────────────────────── */
  console.log("\n★ 관리자 대시보드 (FR-ADM-001 · FR-FILE-006)");
  {
    const page = await get("/admin", adminCookie);
    check("열린다", page.status === 200, `${page.status}`);
    check("스토리지 게이지가 있다", page.body.includes("스토리지"));
    check("아카이브 총량을 말한다", page.body.includes("GitHub 아카이브"));

    const usage = await storageService.usage();
    check(
      "게이지와 차단이 같은 상한을 본다",
      usage.archive.limitBytes === storageService.ARCHIVE_LIMIT_BYTES
    );
    check(
      "80%에서 경고하도록 계산한다",
      usage.archive.warn === usage.archive.ratio >= 0.8
    );
  }

  /* ── 컬렉션 (FR-COLL-003~006) ───────────────────────────────────── */
  console.log("\n★ 컬렉션 (FR-COLL-003~006)");
  {
    const c = await collectionService.create(editorActor, {
      name: `P8 온보딩 ${randomBytes(2).toString("hex")}`,
      description: "검증용",
      visibility: "TEAM",
    });
    madeCollections.push(c.slug);

    const mk = async (title: string) => {
      const input = parseResourceInput({
        type: "DEV_NOTE",
        title,
        noteKind: "TIP",
      });
      if (!input.ok) throw new Error("입력 스키마 실패");
      const r = await resourceWrite.create(editorActor, input.data);
      madeResources.push(r.id);
      return r;
    };
    const r1 = await mk("P8 컬렉션 자료 1");
    const r2 = await mk("P8 컬렉션 자료 2");

    const first = await collectionService.addItem(editorActor, c.slug, r1.id);
    check("담긴다", first.added === true);
    const again = await collectionService.addItem(editorActor, c.slug, r1.id);
    check("두 번 담아도 오류가 아니다", again.added === false);
    await collectionService.addItem(editorActor, c.slug, r2.id);

    const before = await collectionService.getBySlug(c.slug, editorActor);
    check("순서대로 온다", before.items[0]?.id === r1.id);

    await collectionService.reorderItems(editorActor, c.slug, [r2.id, r1.id]);
    const after = await collectionService.getBySlug(c.slug, editorActor);
    check("순서가 바뀐다", after.items[0]?.id === r2.id);

    const stale = await msg(() =>
      collectionService.reorderItems(editorActor, c.slug, [r2.id, "없는id"])
    );
    check("목록에 없는 것이 오면 거절한다", stale.includes("목록이 바뀌었습니다"), stale);

    // 팀 공개는 남도 본다 (FR-COLL-006)
    const asMember = await collectionService.getBySlug(c.slug, memberActor);
    check("팀 공개는 남도 본다", asMember.items.length === 2);

    await collectionService.update(editorActor, c.slug, { visibility: "PRIVATE" });
    const hidden = await msg(() => collectionService.getBySlug(c.slug, memberActor));
    check("비공개로 바꾸면 남은 못 본다", hidden.includes("찾을 수 없습니다"), hidden);

    const notMine = await msg(() =>
      collectionService.update(memberActor, c.slug, { name: "남의 것" })
    );
    check("남의 컬렉션은 못 고친다", notMine.includes("권한이 없습니다"), notMine);

    await collectionService.removeItem(editorActor, c.slug, r1.id);
    const left = await collectionService.getBySlug(c.slug, editorActor);
    check("뺀다", left.items.length === 1);

    const picker = await collectionService.listForPicker(editorActor, r2.id);
    check(
      "담기 목록이 «이미 담김»을 안다",
      picker.find((p) => p.slug === c.slug)?.contains === true
    );

    // 화면에 만들기 버튼이 살아 있다
    const list = await get("/collections", editorCookie);
    check("컬렉션 목록이 열린다", list.status === 200, `${list.status}`);
    check("만들기 버튼이 있다", list.body.includes("컬렉션 만들기"));
  }

  /* ── 탈퇴 즉시 처리 (DEC-021) ───────────────────────────────────── */
  console.log("\n★ 탈퇴는 «즉시» 개인정보를 지운다 (DEC-021)");
  {
    const leaver = await mkUser("leaver", "MEMBER");
    const apiKeyService = await import("@/server/services/api-key.service");
    await apiKeyService.issue(actorOf(leaver), "탈퇴 전 키", ["resources:read"]);

    const col = await collectionService.create(actorOf(leaver), {
      name: `P8 비공개 ${randomBytes(2).toString("hex")}`,
      visibility: "PRIVATE",
    });
    madeCollections.push(col.slug);
    const teamCol = await collectionService.create(actorOf(leaver), {
      name: `P8 팀공개 ${randomBytes(2).toString("hex")}`,
      visibility: "TEAM",
    });
    madeCollections.push(teamCol.slug);

    const anyResource = await db.resource.findFirst({
      where: { deletedAt: null },
      select: { id: true },
    });
    if (anyResource) {
      await db.bookmark.create({
        data: { userId: leaver.id, resourceId: anyResource.id },
      });
    }

    await memberService.transition(adminActor, leaver.id, {
      kind: "WITHDRAW",
      reason: "즉시 처리 경로를 확인합니다",
    });

    const after = await db.user.findUniqueOrThrow({
      where: { id: leaver.id },
      select: { name: true, department: true, bio: true, username: true },
    });
    /*
     * **이름은 마스킹만** 합니다 — 완전 익명화는 1년 뒤 배치입니다.
     * 그때까지 관리자가 감사 로그와 이어 볼 수 있어야 합니다.
     */
    check("이름이 마스킹된다", after.name.includes("*"), after.name);
    check("아이디는 그대로 (1년 뒤 익명화)", after.username === leaver.username);
    check("소속·자기소개가 지워진다", after.department === null && after.bio === null);

    const liveKeys = await db.apiKey.count({
      where: { userId: leaver.id, revokedAt: null },
    });
    check("API 키가 폐기된다", liveKeys === 0, `${liveKeys}개 남음`);

    const privateLeft = await db.collection.count({
      where: { slug: col.slug, deletedAt: null },
    });
    const teamLeft = await db.collection.count({
      where: { slug: teamCol.slug, deletedAt: null },
    });
    check("비공개 컬렉션은 삭제된다", privateLeft === 0);
    /*
     * **팀 공개는 남깁니다.** 온보딩 묶음을 만든 사람이 나갔다고 그것이
     * 사라지면 안 됩니다 — 팀의 자산입니다.
     */
    check("팀 공개 컬렉션은 남는다", teamLeft === 1);

    const marks = await db.bookmark.count({ where: { userId: leaver.id } });
    check("북마크가 삭제된다", marks === 0);
  }

  /* ── 스케줄 · 보존 배치 (REQ-04 · 4.8, DEC-020·DEC-021) ─────────── */
  console.log("\n★ 스케줄 작업과 보존 배치");
  {
    const rows = await maintenanceService.schedules();
    check("스케줄 셋을 안다", rows.length === 3, rows.map((r) => r.type).join(","));
    /*
     * **한 번도 안 돈 것은 «밀린 것»입니다.** 「아직 때가 아니다」로 두면
     * 처음 켠 시스템에서 영원히 안 돕니다.
     */
    check(
      "한 번도 안 돈 것은 밀린 것으로 본다",
      rows.every((r) => r.lastRunAt !== null || r.due),
      rows.map((r) => `${r.type}:${r.due}`).join(" ")
    );

    const status = await maintenanceService.retentionStatus();
    check(
      "보존 상태를 «읽기만» 하고 센다",
      typeof status.anonymizeDue === "number" &&
        typeof status.keysExpiringSoon === "number"
    );

    // 1년 지난 탈퇴 계정을 만들어 익명화를 실제로 돌린다
    const old = await mkUser("old", "MEMBER");
    await memberService.transition(adminActor, old.id, {
      kind: "WITHDRAW",
      reason: "1년 경과 익명화 경로를 확인합니다",
    });
    await db.user.update({
      where: { id: old.id },
      data: {
        statusChangedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
      },
    });
    const oldUsername = (
      await db.user.findUniqueOrThrow({
        where: { id: old.id },
        select: { username: true },
      })
    ).username;

    const before = await maintenanceService.retentionStatus();
    check("익명화 대상으로 잡힌다", before.anonymizeDue >= 1, `${before.anonymizeDue}건`);

    const r = await maintenanceService.runRetention(adminActor);
    check("익명화된다", r.anonymized >= 1, `${r.anonymized}건`);

    const anon = await db.user.findUniqueOrThrow({
      where: { id: old.id },
      select: { username: true, name: true, passwordHash: true },
    });
    check("아이디가 바뀐다", anon.username.startsWith("deleted_"), anon.username);
    check("이름이 익명이 된다", anon.name === "탈퇴한 사용자", anon.name);
    check("비밀번호 해시가 무효화된다", anon.passwordHash.startsWith("!anonymized:"));

    /*
     * **옛 아이디는 «예약»됩니다** — 남이 같은 아이디로 가입해 옛 감사
     * 로그를 물려받으면 안 됩니다.
     */
    const reserved = await db.reservedUsername.findUnique({
      where: { username: oldUsername },
    });
    check("옛 아이디가 예약된다", reserved !== null, oldUsername);

    const taken = await import("@/server/repositories/user.repository");
    check(
      "그 아이디로는 가입할 수 없다",
      await taken.isUsernameTaken(oldUsername),
      "users 와 reserved 양쪽을 본다"
    );

    // 두 번 돌려도 같은 계정을 다시 잡지 않는다
    const again = await maintenanceService.runRetention(adminActor);
    check("이미 익명화된 계정은 다시 안 잡는다", again.anonymized === 0, `${again.anonymized}건`);
  }

  /*
   * ## **0건으로 통과시키지 않습니다** (`DEC-044`)
   *
   * 스케줄 작업 셋을 처음 돌렸을 때 전부 `DONE` 이었지만 결과가
   * `{checked: 0}`·`{purged: 0}` 이었습니다 — DB 에 대상이 없었기 때문입니다.
   * 「돌았다」와 「일했다」는 다릅니다. 그래서 **대상을 만들어 두고** 돌립니다.
   */
  console.log("\n★ 스케줄 작업이 실제로 일한다");
  {
    const { runNow, enqueue } = await import("@/server/services/job.service");
    await import("@/server/jobs");

    // ── 링크 확인: 사는 링크와 죽은 링크를 하나씩 ──
    const mkUrl = async (title: string, url: string) => {
      const input = parseResourceInput({
        type: "DEV_NOTE",
        title,
        noteKind: "TIP",
        url,
      });
      if (!input.ok) throw new Error("입력 스키마 실패");
      const r = await resourceWrite.create(editorActor, input.data);
      madeResources.push(r.id);
      return r;
    };
    /*
     * **바깥 인터넷을 안 씁니다.** 검증이 네트워크 사정에 따라 흔들리면
     * 안 되고, `/api/health` 는 이 서버가 항상 200 을 줍니다.
     */
    const alive = await mkUrl("P8 링크 살아있음", `${BASE}/api/health`);
    /*
     * **`/api/` 아래를 씁니다.** 처음에 `/vp8-definitely-not-here` 를 썼더니
     * `MOVED` 가 나왔습니다 — 그 경로는 `proxy` 가 로그인으로 307 을 보내고,
     * 링크 확인은 쿠키가 없으니 `/login` 까지 따라가 **200 + 다른 주소**를
     * 봅니다. 검사가 틀린 것이지만, **로그인 뒤에 있는 URL 은 죽었는지
     * 확인할 수 없다**는 사실도 함께 드러났습니다(그래서 `MOVED` 가 맞습니다).
     */
    const dead = await mkUrl("P8 링크 죽음", `${BASE}/api/vp8-not-here`);

    const linkJob = await enqueue({ type: "CHECK_LINK" });
    await runNow(linkJob.id);

    const [a, d] = await Promise.all([
      db.resource.findUniqueOrThrow({
        where: { id: alive.id },
        select: { sourceStatus: true, sourceCheckedAt: true },
      }),
      db.resource.findUniqueOrThrow({
        where: { id: dead.id },
        select: { sourceStatus: true },
      }),
    ]);
    check("사는 링크는 OK", a.sourceStatus === "OK", String(a.sourceStatus));
    check("확인 시각을 남긴다", a.sourceCheckedAt !== null);
    check("404 는 GONE", d.sourceStatus === "GONE", String(d.sourceStatus));

    /*
     * **로그인 뒤의 주소는 `GONE` 이 아닙니다.** 확인할 수 없는 것을
     * 「죽었다」로 표시하면 멀쩡한 자료에 「원본 없음」이 붙고, 되돌리는
     * 사람이 아무도 없습니다.
     */
    const walled = await mkUrl("P8 로그인 뒤", `${BASE}/vp8-behind-login`);
    const j2 = await enqueue({ type: "CHECK_LINK" });
    await runNow(j2.id);
    const w = await db.resource.findUniqueOrThrow({
      where: { id: walled.id },
      select: { sourceStatus: true },
    });
    check(
      "확인할 수 없는 링크는 GONE 이 아니다",
      w.sourceStatus === "MOVED",
      String(w.sourceStatus)
    );

    const linkResult = await db.job.findUniqueOrThrow({
      where: { id: linkJob.id },
      select: { status: true, result: true },
    });
    const lr = linkResult.result as { checked: number } | null;
    check("작업이 끝나고 «몇 건 봤는지» 남긴다", linkResult.status === "DONE" && (lr?.checked ?? 0) >= 2, JSON.stringify(lr));

    // ── 휴지통 정리: 31일 전에 지운 자료 ──
    const oldTrash = await mkUrl("P8 오래된 휴지통", `${BASE}/api/health`);
    await db.resource.update({
      where: { id: oldTrash.id },
      data: { deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) },
    });
    const fresh = await mkUrl("P8 방금 지운 것", `${BASE}/api/health`);
    await resourceService.remove(editorActor, fresh.id);

    const trashJob = await enqueue({ type: "CLEANUP_TRASH" });
    await runNow(trashJob.id);

    const goneRow = await db.resource.findUnique({ where: { id: oldTrash.id } });
    const freshRow = await db.resource.findUnique({ where: { id: fresh.id } });
    check("30일 지난 것은 지워진다", goneRow === null);
    /*
     * **방금 지운 것은 남아야 합니다.** 유예 기간이 있는 이유가 그것이고,
     * 경계를 안 보면 「휴지통이 즉시 비는」 코드도 이 검사를 통과합니다.
     */
    check("방금 지운 것은 남는다", freshRow !== null);

    const purgeLog = await db.auditLog.findFirst({
      where: { action: "RESOURCE_PURGE", summary: { contains: "자동 정리" } },
      select: { summary: true, actorId: true },
    });
    check("자동 정리가 기록된다", Boolean(purgeLog), purgeLog?.summary ?? "");
    /*
     * **행위자가 없습니다.** 배치가 한 일에 사람 이름을 찍으면
     * 「그 사람이 새벽에 200건을 지웠다」가 됩니다.
     */
    check("배치는 행위자 없이 남는다", purgeLog?.actorId === null);
  }

  /* ── 마이페이지 (FR-USER-002·007) ───────────────────────────────── */
  console.log("\n★ 마이페이지 — 프로필 수정과 탈퇴 (FR-USER-002 · 007)");
  {
    const meCookie = await cookieFor(member.id);
    const page = await get("/me", meCookie);
    check("마이페이지가 열린다", page.status === 200, `${page.status}`);
    check(
      "「준비 중」 문구가 사라졌다",
      !page.body.includes("자기소개 수정은 준비"),
      "이 문구가 남아 있으면 화면이 옛 상태다"
    );
    /*
     * **탭 안의 것은 HTML 에 없습니다.** Radix `Tabs` 는 활성 탭만 마운트하므로
     * 「계정」 탭의 탈퇴 버튼은 첫 응답에 안 들어옵니다 — 처음에 그걸 찾다가
     * 「없다」로 잡혔는데, **화면이 아니라 검사가 틀린** 것이었습니다.
     * 기본 탭(프로필)에 있는 것으로 «배선됐는가»를 봅니다.
     */
    check("프로필 저장 버튼이 있다", page.body.includes("저장"));
    check(
      "이름 칸이 잠겨 있지 않다",
      !/id="name"[^>]*disabled/.test(page.body),
      "disabled 면 옛 화면이다"
    );

    // 본인 탈퇴는 **강제 탈퇴와 같은 함수**를 지납니다 — 액션은 앞에 비밀번호만 더합니다
    const selfLeaver = await mkUser("self", "MEMBER");
    await memberService.transition(actorOf(selfLeaver), selfLeaver.id, {
      kind: "WITHDRAW",
      reason: "본인 요청으로 탈퇴했습니다.",
    });
    const selfLog = await db.auditLog.findFirst({
      where: { targetId: selfLeaver.id, action: "USER_WITHDRAW" },
      select: { actorUsername: true },
    });
    /*
     * **행위자가 본인입니다.** 관리자가 한 것과 구별되어야 합니다 —
     * 「누가 이 계정을 없앴나」의 답이 달라집니다.
     */
    check(
      "본인 탈퇴는 행위자가 본인이다",
      selfLog?.actorUsername === selfLeaver.username,
      selfLog?.actorUsername ?? ""
    );

    await userService.updateProfile(member.id, {
      name: "이름바꿈",
      department: "검증팀",
      bio: "한 줄 소개",
    });
    const p = await userService.getProfile(member.id);
    check("프로필이 바뀐다", p.name === "이름바꿈" && p.department === "검증팀");

    /*
     * **`updateProfile` 로는 상태·역할을 못 바꿉니다** — 그 문은
     * `member.service.transition` 하나뿐입니다 (`DEC-036`).
     * 타입이 막으므로 여기서는 «그 인자가 없다»는 사실만 확인합니다.
     */
    check("역할·상태는 그대로다", p.role === "MEMBER" && p.status === "ACTIVE");
  }
  /* ── 작업 알림 · 변경 이력 (FR-NOTI-004 · FR-RES-013) ───────────── */
  console.log("\n★ 작업이 끝나면 «요청한 사람»에게 알린다 (FR-NOTI-004)");
  {
    const { enqueue, runNow } = await import("@/server/services/job.service");
    await import("@/server/jobs");

    const input = parseResourceInput({
      type: "DEV_NOTE",
      title: "P8 알림 검증 자료",
      noteKind: "TIP",
    });
    if (!input.ok) throw new Error("입력 스키마 실패");
    const res = await resourceWrite.create(editorActor, input.data);
    madeResources.push(res.id);

    // ── 성공 ──
    const okJob = await enqueue({
      type: "CLEANUP_TRASH",
      resourceId: res.id,
      requestedById: editor.id,
    });
    await runNow(okJob.id);

    const done = await db.notification.findFirst({
      where: { userId: editor.id, type: "JOB_DONE" },
      orderBy: { createdAt: "desc" },
      select: { title: true, linkUrl: true },
    });
    check("완료 알림이 온다", Boolean(done), done?.title ?? "");
    /*
     * **작업 이름이 사람 말이어야 합니다.** `CLEANUP_TRASH` 라고 뜨면
     * 받는 사람이 무슨 일인지 모릅니다.
     */
    check(
      "기계 이름이 아니라 사람 말이다",
      (done?.title ?? "").includes("휴지통 정리"),
      done?.title ?? ""
    );
    /*
     * **링크가 알림의 절반입니다.** 「끝났습니다」만 오면 그 자료를 다시
     * 찾아야 합니다.
     */
    check(
      "자료로 바로 가는 링크가 붙는다",
      (done?.linkUrl ?? "").includes(`/${res.slug}`),
      done?.linkUrl ?? ""
    );

    // ── 실패 ── 처리기가 없는 타입으로 일부러 실패시킨다
    const badJob = await enqueue({
      type: "GENERATE_THUMBNAIL",
      requestedById: editor.id,
    });
    await runNow(badJob.id);
    const failed = await db.notification.findFirst({
      where: { userId: editor.id, type: "JOB_FAILED" },
      orderBy: { createdAt: "desc" },
      select: { title: true, body: true },
    });
    check("실패 알림도 온다", Boolean(failed), failed?.title ?? "");
    check(
      "왜 실패했는지 싣는다",
      (failed?.body ?? "").includes("처리기가 등록되지 않은"),
      failed?.body ?? ""
    );

    /*
     * **요청자가 없는 배치는 «성공»을 안 알립니다.** 「휴지통을 정리했습니다」를
     * 매일 받으면 알림함이 그것으로 찹니다.
     */
    const before = await db.notification.count({
      where: { type: "JOB_DONE" },
    });
    const batch = await enqueue({ type: "CLEANUP_TRASH" });
    await runNow(batch.id);
    const after = await db.notification.count({ where: { type: "JOB_DONE" } });
    check("요청자 없는 배치는 성공을 안 알린다", after === before, `${before} → ${after}`);
  }

  console.log("\n★ 자료 변경 이력 (FR-RES-013)");
  {
    const input = parseResourceInput({
      type: "DEV_NOTE",
      title: "P8 이력 검증 자료",
      noteKind: "TIP",
    });
    if (!input.ok) throw new Error("입력 스키마 실패");
    const res = await resourceWrite.create(editorActor, input.data);
    madeResources.push(res.id);

    const input2 = parseResourceInput({
      type: "DEV_NOTE",
      title: "P8 이력 검증 자료 (수정됨)",
      noteKind: "TIP",
    });
    if (!input2.ok) throw new Error("입력 스키마 실패");
    await resourceWrite.update(editorActor, res.id, input2.data);

    const h = await audit.list({
      page: 1,
      size: 10,
      filter: { targetId: res.id },
    });
    check("등록과 수정이 둘 다 남는다", h.total >= 2, `${h.total}건`);
    check(
      "행위자를 안다",
      h.items.every((l) => l.actorUsername === editor.username)
    );

    /*
     * **이력 테이블을 새로 만들지 않았습니다.** 감사 로그를 자료 각도로
     * 본 것뿐이라, 감사 로그에 남는 것이 곧 이력입니다.
     */
    const page = await get(
      `/resources/dev-note/${encodeURIComponent(res.slug)}`,
      editorCookie
    );
    check("자료 상세가 열린다", page.status === 200, `${page.status}`);
    check("변경 이력 카드가 있다", page.body.includes("변경 이력"));
    check(
      "행위가 사람 말로 보인다",
      page.body.includes("자료 등록") || page.body.includes("자료 수정")
    );

    /*
     * **고칠 수 없는 사람에게는 안 보입니다.** 「누가 언제 뭘 고쳤나」는
     * 그 자료를 고칠 수 있는 사람이 알아야 하는 것입니다.
     */
    const memberCookie = await cookieFor(member.id);
    const asMember = await get(
      `/resources/dev-note/${encodeURIComponent(res.slug)}`,
      memberCookie
    );
    check("남에게는 이력이 안 보인다", !asMember.body.includes("변경 이력"));
  }
  /* ── 권한 경계 (DEC-057, OPEN-016 해소) ─────────────────────────── */
  console.log("\n★ 관리 영역은 통째로 ADMIN 이다 (DEC-057)");
  {
    /*
     * ## 여기서 «상태 코드»를 봅니다
     *
     * `EDITOR` 에게 관리 그룹을 열어 봤다가 되돌린 이유가 이 검사입니다.
     * 레이아웃을 `EDITOR` 로 낮추면 `page` 의 `redirect()` 가
     * **`307` 이 아니라 `200` + 클라이언트 리다이렉트**가 됩니다 —
     * 레이아웃이 먼저 스트리밍을 시작해 상태 코드를 못 바꿉니다.
     * 그래서 「막혔다」를 **본문이 아니라 상태 코드로** 확인합니다.
     */
    for (const path of [
      "/admin",
      "/admin/members",
      "/admin/taxonomy",
      "/admin/settings",
      "/admin/audit-logs",
      "/admin/resources",
    ]) {
      const r = await get(path, editorCookie);
      check(`EDITOR 는 ${path} 에서 막힌다`, r.status !== 200, `${r.status}`);
    }

    const adminTax = await get("/admin/taxonomy", adminCookie);
    check("ADMIN 은 열린다", adminTax.status === 200, `${adminTax.status}`);
    check("세 탭이 다 있다", adminTax.body.includes("콘텐츠 타입"));

    /*
     * **`EDITOR` 가 잃은 것은 «체계를 고치는» 일뿐입니다.**
     * 자료를 등록하며 분류를 고르고 태그를 만드는 것은 그대로입니다.
     */
    const editorCanTag = await tagService.suggest("vp8");
    check("EDITOR 도 자동완성은 쓴다", Array.isArray(editorCanTag));
    const cantEdit = await msg(() =>
      categoryService.create(editorActor, { name: "안 됨", slug: "vp8-editor" })
    );
    check("EDITOR 는 분류를 못 고친다", cantEdit.includes("권한이 없습니다"), cantEdit);
  }

  console.log(`\n합계: 통과 ${pass} · 실패 ${fail}`);
}

async function cleanup() {
  if (madeCollections.length) {
    await db.collectionItem.deleteMany({
      where: { collection: { slug: { in: madeCollections } } },
    });
    await db.collection.deleteMany({ where: { slug: { in: madeCollections } } });
  }
  if (madeResources.length) {
    await db.resource.deleteMany({ where: { id: { in: madeResources } } });
  }
  if (madeTags.length) {
    await db.tag.deleteMany({ where: { slug: { in: madeTags } } });
  }
  if (madeCategories.length) {
    await db.category.deleteMany({ where: { slug: { in: madeCategories } } });
  }
  await db.notification.deleteMany({
    where: { user: { username: { startsWith: "vp8_" } } },
  });
  if (madeUsers.length) {
    // 익명화가 만든 예약 아이디도 치웁니다 — 안 그러면 매 실행마다 쌓입니다
    const leftovers = await db.user.findMany({
      where: { id: { in: madeUsers } },
      select: { username: true },
    });
    void leftovers;
    await db.reservedUsername.deleteMany({
      where: { username: { startsWith: "vp8_" } },
    });
    await db.apiKey.deleteMany({ where: { userId: { in: madeUsers } } });
    await db.session.deleteMany({ where: { userId: { in: madeUsers } } });
    await db.notification.deleteMany({ where: { userId: { in: madeUsers } } });
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
