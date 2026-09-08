import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { cleanup, db, makeUser, signIn } from "./fixtures";

/**
 * 접근성 점검 (`NFR-A11Y-001`~`006`, `M6`).
 *
 *   npm run a11y     (`npm run dev` 가 떠 있어야 합니다)
 *
 * ## 왜 axe 인가
 *
 * 「WCAG 2.1 AA 를 목표로 한다」(`NFR-A11Y-001`)는 **사람이 읽는 문장**이라
 * 체크리스트로 만들면 매번 「봤다」로 끝납니다. axe 는 **실제로 그려진 화면**을
 * 보고 규칙 위반을 셉니다 — 라벨 없는 입력, 이름 없는 버튼, 모자란 대비.
 *
 * ## axe 가 «못» 보는 것도 있습니다
 *
 * 키보드로 끝까지 갈 수 있는지, 포커스가 보이는지는 정적 검사로 안 됩니다.
 * 아래 「키보드」 테스트가 그 부분을 직접 눌러 봅니다.
 *
 * ## 다크 모드도 봅니다
 *
 * 대비(`NFR-A11Y-003`)는 테마마다 다른 값입니다. 밝은 화면만 보고 통과시키면
 * 「어두운 화면에서만 안 보이는 글씨」가 그대로 남습니다.
 */

/** WCAG 2.1 AA 까지 — 요구사항이 정한 기준 그대로입니다 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

test.afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

async function scan(page: Page, label: string) {
  const { violations, passes } = await new AxeBuilder({ page })
    .withTags(TAGS)
    /*
     * **Next 의 개발용 오버레이는 우리 화면이 아닙니다.** dev 서버가 붙이는
     * 버튼이라 운영 빌드에는 없습니다 — 그것 때문에 실패하면 고칠 곳이
     * 우리 저장소에 없습니다.
     */
    .exclude("nextjs-portal")
    .analyze();

  if (violations.length > 0) {
    const lines = violations.map(
      (v) =>
        `  [${v.impact}] ${v.id} — ${v.help}\n` +
        v.nodes
          .slice(0, 3)
          .map((n) => `      ${n.html.slice(0, 140)}`)
          .join("\n")
    );
    console.log(`\n✗ ${label}\n${lines.join("\n")}`);
  }
  expect(
    violations,
    `${label}: ${violations.map((v) => v.id).join(", ")}`
  ).toEqual([]);

  /*
   * **「위반 0건」이 증거가 되려면 axe 가 뭔가를 «보긴» 했어야 합니다**
   * (`DEC-044` 「0건은 증거가 아니다」).
   *
   * 화면이 안 뜨거나 셀렉터가 빗나가도 위반은 0건입니다 — 그때 이 검사는
   * 「접근성이 좋다」가 아니라 **「아무것도 안 봤다」**를 말하고 있습니다.
   * 통과한 규칙 수를 함께 봅니다.
   */
  expect(
    passes.length,
    `${label}: axe 가 아무 규칙도 못 봤습니다`
  ).toBeGreaterThan(5);
}

/* ── 비로그인 화면 ──────────────────────────────────────────────── */

/*
 * **가입 신청 화면이 있었습니다.** 절차와 함께 사라졌습니다 (`DEC-077`) —
 * 비로그인으로 볼 수 있는 화면은 이제 로그인 하나입니다.
 */
for (const [label, path] of [["로그인", "/login"]] as const) {
  for (const scheme of ["light", "dark"] as const) {
    test(`${label} (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await scan(page, `${label} · ${scheme}`);
    });
  }
}

/* ── 로그인 뒤 화면 ─────────────────────────────────────────────── */

for (const scheme of ["light", "dark"] as const) {
  test(`로그인 뒤 주요 화면 (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await runLoggedInScan(page, scheme);
  });
}

async function runLoggedInScan(page: Page, scheme: string) {
  const user = await makeUser({ tag: `a11y${scheme}` });
  await signIn(page, user.username);

  /*
   * **자료가 하나는 있어야 합니다.** 빈 목록은 표도 카드도 안 그리므로,
   * 비어 있는 화면만 훑고 「위반 0건」이라고 말하게 됩니다 —
   * `DEC-044` 「0건은 증거가 아니다」가 여기에도 그대로 적용됩니다.
   */
  const slug = `a11y-${scheme}-${Date.now().toString(36)}`;
  await db.resource.create({
    data: {
      type: "DEV_NOTE",
      slug,
      title: "E2E 접근성 점검 자료",
      summary: "표와 상세가 실제로 그려지도록 하나 둡니다",
      body: "## 소제목\n\n본문입니다. [링크](https://example.com)\n\n- 하나\n- 둘",
      status: "PUBLISHED",
      authorId: user.id,
      devNote: { create: { noteKind: "TIP" } },
    },
  });

  /*
   * **도우미 패널을 열어 둔 채로 훑습니다.**
   *
   * 패널은 앱 테마와 무관하게 **언제나 어둡습니다**(`chat-panel` 의 `.dark`).
   * 손으로 정한 색 조합이라 대비가 어긋나기 쉬운 자리이고, 닫힌 채로 훑으면
   * 그 조합을 **한 번도 안 보게** 됩니다 — `DEC-044` 「0건은 증거가 아니다」.
   */
  await page.evaluate(() => window.localStorage.setItem("qb.chat.open", "1"));

  for (const [label, path] of [
    ["대시보드", "/dashboard"],
    ["자료 목록", "/resources"],
    ["자료 상세", `/resources/dev-note/${slug}`],
    ["자료 등록", "/resources/new"],
    ["검색", "/search?q=접근성"],
    ["내 정보", "/me"],
    ["관리자 홈", "/admin"],
    ["회원 관리", "/admin/members"],
  ] as const) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await scan(page, `${label} · ${scheme}`);
  }
}

/* ── 키보드 (NFR-A11Y-002) — axe 가 못 보는 부분 ─────────────────── */

test("키보드만으로 로그인까지 간다", async ({ page }) => {
  const user = await makeUser({ tag: "kbd" });
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  /*
   * **Tab 으로 돌면서 아이디 칸을 찾습니다.** 「focus() 로 넣고 채운다」는
   * 키보드 검증이 아닙니다 — 실제로 «닿을 수 있는가»가 요구사항입니다.
   */
  let reached = false;
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    /*
     * 판정을 **브라우저 안에서** 합니다. 밖으로 id 를 꺼내 선택자를 만들면
     * `CSS.escape` 가 필요한데 그건 브라우저 전역이라 러너에 없습니다 —
     * 실제로 `CSS is not defined` 로 죽었습니다.
     */
    const label = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return "";
      const byFor = el.id
        ? document.querySelector(`label[for="${el.id}"]`)?.textContent
        : null;
      return (
        byFor ??
        el.closest("label")?.textContent ??
        el.getAttribute("aria-label") ??
        ""
      );
    });
    if (label.includes("아이디")) {
      reached = true;
      break;
    }
  }
  expect(reached, "Tab 만으로 아이디 칸에 못 닿았습니다").toBe(true);

  /*
   * **포커스가 «보여야» 합니다** (`NFR-A11Y-002` — 포커스 링을 제거하지 않는다).
   * `outline: none` 만 걸고 대체 표시가 없으면 키보드 사용자는 지금 어디에
   * 있는지 알 수 없습니다.
   */
  const visible = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    const s = getComputedStyle(el);
    const hasOutline =
      s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
    const hasRing = s.boxShadow !== "none" && s.boxShadow !== "";
    return hasOutline || hasRing;
  });
  expect(visible, "포커스 표시가 없습니다").toBe(true);

  // 그대로 끝까지 — 마우스를 한 번도 안 씁니다
  await page.keyboard.type(user.username);
  await page.keyboard.press("Tab");
  await page.keyboard.type("E2eTest!12345");
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
    timeout: 30_000,
  });
});
