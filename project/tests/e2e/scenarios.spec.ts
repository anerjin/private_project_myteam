import { expect, test } from "@playwright/test";

import {
  BASE_URL,
  TEST_PASSWORD,
  cleanup,
  db,
  makeUser,
  signIn,
  uniq,
} from "./fixtures";

/**
 * 필수 E2E 6종 (`NFR-MAINT-004`, `DEV-07 · 7.8`).
 *
 * ## 여기서만 볼 수 있는 것
 *
 * `verify:p3`~`p8` 은 HTTP 로 화면을 «그려» 보고 service 를 직접 불렀습니다.
 * 그 사이에 **Server Action 이 통째로 빠져 있습니다** — 폼 제출, 버튼,
 * 리다이렉트, 낙관적 갱신. 사용자가 겪는 쓰기 경로 전부입니다.
 *
 * 그래서 이 여섯은 **이미 증명된 것을 다시 하지 않습니다.** 예를 들어
 * 시나리오 ③의 아카이브 파이프라인은 `verify:p6` 가, ⑥의 Ingest 등록은
 * `verify:p7-mcp` 가 이미 관통했습니다 — 여기서는 **그 결과가 화면에
 * 나타나는지**만 봅니다.
 */

test.afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

/* ────────────────────────────────────────────────────────────────────────
 * ① 회원가입 → 승인 대기 → 관리자 승인 → 로그인 → 대시보드
 * ──────────────────────────────────────────────────────────────────────── */
test("① 가입 신청이 승인을 거쳐 대시보드까지 간다", async ({ page }) => {
  const username = uniq("signup");

  await page.goto("/signup");
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/아이디/).fill(username);
  /*
   * **칸을 벗어나야 판정이 뜹니다.** 화면이 `touched` 전에는 아무 말도
   * 하지 않습니다 — 타이핑 중에 빨간 글씨를 띄우지 않으려는 것입니다.
   */
  await page.getByLabel(/아이디/).blur();

  /*
   * **아이디 확인이 서버에 묻는지 봅니다.** 여기 하드코딩된 목록이 있어서
   * 아무 이름에나 초록불이 켜지던 자리입니다 (`DEC-063`).
   */
  await expect(
    page.getByText("사용할 수 있는 아이디입니다")
  ).toBeVisible({ timeout: 15_000 });

  await page.getByLabel(/^이름/).fill("E2E 가입자");
  await page.getByLabel(/소속 팀/).fill("검증팀");
  await page.getByLabel(/^비밀번호 \*/).fill(TEST_PASSWORD);
  await page.getByLabel(/비밀번호 확인/).fill(TEST_PASSWORD);
  await page.getByLabel(/가입 사유/).fill("E2E 시나리오 ① 확인용 신청입니다.");
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "가입 신청" }).click();

  // 신청 직후에는 «대기» 화면입니다 — 대시보드가 아닙니다
  await expect(page).toHaveURL(/\/(signup\/complete|pending)/, {
    timeout: 20_000,
  });

  /*
   * **계정이 «실제로» 생겼는지 봅니다.** 화면이 완료 페이지로 갔다는 것과
   * 계정이 생겼다는 것은 다른 사실입니다 — 여기가 이 시나리오의 첫 증거입니다.
   */
  await expect
    .poll(
      async () => db.user.count({ where: { username, status: "PENDING" } }),
      { timeout: 15_000 }
    )
    .toBe(1);

  // 승인 전에는 대시보드로 못 들어갑니다
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/(pending|login)/);

  /*
   * **관리자가 «화면에서» 승인합니다.** 여기가 이 시나리오의 핵심입니다 —
   * `transitionMany` 를 직접 부르면 승인 버튼·일괄 선택·리다이렉트가 빠집니다.
   */
  /*
   * **시드 관리자를 빌려 쓰지 않습니다.** 그 계정의 비밀번호는 `.env` 의
   * `ADMIN_SEED_PASSWORD` 이고 E2E 는 그 값을 모릅니다 — 처음에 빌려 썼다가
   * 로그인이 30초 동안 안 돼 그 사실을 알았습니다. 게다가 실제 운영 계정을
   * 검증이 만지는 것 자체가 좋지 않습니다.
   */
  const admin = await makeUser({ tag: "approver", role: "ADMIN" });
  const adminPage = await page.context().browser()!.newPage();
  await signIn(adminPage, admin.username);
  await adminPage.goto("/admin/members");
  // `getByRole("row", { name })` 은 «접근성 이름»을 보는데 `<tr>` 에는 대개
  // 그런 이름이 없어서 아무것도 안 잡힙니다 — 내용은 멀쩡히 있는데도.
  const row = adminPage.getByRole("row").filter({ hasText: username });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: "승인" }).click();
  await expect(adminPage.getByText(/승인했습니다|명을 승인/)).toBeVisible({
    timeout: 15_000,
  });
  await adminPage.close();

  // 승인됐으니 이제 들어갑니다
  await signIn(page, username);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
  await expect(page.getByText("E2E 가입자").first()).toBeVisible();
});

/* ────────────────────────────────────────────────────────────────────────
 * ② 자료 검색 → 필터 → 상세 → 북마크
 * ──────────────────────────────────────────────────────────────────────── */
test("② 검색해서 찾은 자료를 북마크한다", async ({ page }) => {
  const user = await makeUser({ tag: "reader", role: "EDITOR" });
  const title = `E2E 검색 대상 ${Date.now().toString(36)}`;

  const resource = await db.resource.create({
    data: {
      type: "DEV_NOTE",
      /*
       * **slug 에 한글을 넣습니다.** 실제 자료의 slug 는 제목에서 만들어져
       * 대부분 한글입니다. ASCII slug 로만 검사하면 경로 인코딩 문제가
       * 영영 안 드러납니다 — 실제로 그래서 못 잡았습니다.
       */
      slug: `e2e-검색-대상-${Date.now().toString(36)}`,
      title,
      summary: "E2E 시나리오 ② 가 찾을 자료",
      status: "PUBLISHED",
      authorId: user.id,
      devNote: { create: { noteKind: "TIP" } },
    },
    select: { id: true, slug: true },
  });

  await signIn(page, user.username);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

  /*
   * 헤더 검색 (`FR-SRCH-002` — 「어느 화면에서든 `Ctrl+K`」).
   *
   * **본문을 먼저 누릅니다.** 리다이렉트 직후에는 포커스가 문서에 없을 수
   * 있고, 그러면 키가 리스너에 닿지 않습니다 — 처음에 그렇게 실패했습니다.
   */
  await page.locator("body").click();
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/검색/).fill(title);
  /*
   * **「전체 검색」 항목이 실제로 보이는지**가 이 단계의 핵심입니다.
   * 이 검사가 처음 돌았을 때 팔레트에는 「최근 자료 중에는 없습니다.」 한 줄만
   * 있었습니다 — 항목에만 `forceMount` 가 걸려 있어 cmdk 가 **그룹을 통째로
   * 숨긴** 것이었고, 그건 `DEC-044` 「0건은 증거가 아니다」가 막으려던 바로
   * 그 화면입니다. 그룹에도 `forceMount` 를 걸어 고쳤습니다.
   */
  await page
    .getByRole("option", { name: /전체 자료에서 찾기/ })
    .click({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/search\?q=/, { timeout: 15_000 });
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 15_000 });

  // 타입 필터를 걸어도 남아 있어야 한다
  await page.goto(`/resources?type=DEV_NOTE&q=${encodeURIComponent(title)}`);
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 15_000 });

  // 상세로
  await page.goto(`/resources/dev-note/${resource.slug}`);
  await expect(page.getByText("E2E 시나리오 ② 가 찾을 자료")).toBeVisible();

  /*
   * **헤더의 빵부스러기가 «주소»가 아니라 «제목»을 그린다** (`DEV-03 · 3.4`).
   *
   * 한글 slug 는 경로에서 `%EB%9D%BC…` 로 실려 옵니다. 그걸 풀지 않으면
   * ① 서버가 그 문자열로 제목을 찾다 언제나 실패하고
   * ② 화면은 주소창 문자열을 **제목 자리에** 그대로 찍습니다.
   * 마지막 조각은 이 문서의 유일한 `<h1>` 이라 더 그렇습니다.
   */
  const crumb = page.locator('[aria-current="page"]');
  await expect(crumb).toHaveText(title);
  expect(
    await crumb.textContent(),
    "빵부스러기에 퍼센트 인코딩이 남아 있습니다"
  ).not.toMatch(/%[0-9A-Fa-f]{2}/);

  // 수정 화면에서도 — 여기선 마지막 조각이 「수정」이라 slug 가 가운데로 온다
  await page.goto(`/resources/dev-note/${resource.slug}/edit`);
  await expect(page.getByRole("link", { name: title })).toBeVisible({
    timeout: 15_000,
  });

  // **상세로 되돌아옵니다** — 아래 북마크는 상세 화면의 버튼입니다
  await page.goto(`/resources/dev-note/${resource.slug}`);

  /*
   * **북마크는 낙관적 갱신입니다.** 눌렀을 때 화면이 먼저 바뀌고 서버가
   * 뒤따릅니다 — 그 왕복이 실제로 저장되는지는 DB 로 확인합니다.
   */
  await page.getByRole("button", { name: /북마크/ }).first().click();
  await expect
    .poll(
      async () =>
        db.bookmark.count({
          where: { userId: user.id, resourceId: resource.id },
        }),
      { timeout: 15_000 }
    )
    .toBe(1);

  // 「내 북마크」에 나타난다
  await page.goto("/bookmarks");
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 15_000 });
});

/* ────────────────────────────────────────────────────────────────────────
 * ③ GitHub URL 등록 → 메타 수집 → 아카이브 → 다운로드
 * ──────────────────────────────────────────────────────────────────────── */
test("③ GitHub 자료를 등록하면 수집 작업이 걸린다", async ({ page }) => {
  const user = await makeUser({ tag: "gh", role: "EDITOR" });
  await signIn(page, user.username);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

  const title = `E2E GitHub ${Date.now().toString(36)}`;
  await page.goto("/resources/new?type=GITHUB_REPO");
  await page.getByLabel("제목").fill(title);
  await page
    .getByLabel("URL", { exact: false })
    .first()
    .fill("https://github.com/octocat/Spoon-Knife");

  /*
   * **마지막 태그는 쉼표로 끝내지 «않습니다».**
   *
   * 태그 칸은 쉼표·Enter·후보 클릭에서만 확정했고, 칸에 남은 글자는 어디에도
   * 실리지 않았습니다. 그래서 마지막 태그를 치고 곧바로 「등록」을 누르면
   * **조용히 사라졌습니다** — 화면 폼으로 6종을 등록해 보다가 여섯 개 전부
   * 마지막 태그를 잃고서야 알았습니다.
   *
   * 사람이 실제로 하는 동작이 이것입니다. 그러니 검사도 이렇게 칩니다.
   */
  const tagKept = `e2e끝태그${Date.now().toString(36)}`;
  await page.getByLabel("태그").fill(`e2e첫태그, ${tagKept}`);

  /*
   * **`exact: true` 입니다.** `/등록/` 로 잡으면 같은 화면 위쪽의 「URL 빠른
   * 등록」(`FR-RES-005`)이 가진 **「등록 폼 열기」**가 먼저 걸립니다 — 그건
   * 다른 `<form>` 이고, 빈 URL 로 제출되며 `?type=` 까지 떨어뜨립니다.
   */
  await page.getByRole("button", { name: "등록", exact: true }).click();

  // 상세로 넘어간다
  await expect(page).toHaveURL(/\/resources\/github-repo\//, {
    timeout: 30_000,
  });

  const created = await db.resource.findFirstOrThrow({
    where: { title },
    select: { id: true, tags: { select: { tag: { select: { label: true } } } } },
  });

  // 쉼표로 끝내지 않은 태그도 저장돼 있어야 한다
  const labels = created.tags.map((t) => t.tag.label);
  expect(labels, `저장된 태그: ${labels.join(", ")}`).toContain(tagKept);

  /*
   * **메타 수집 작업이 «걸리는» 것까지 봅니다.** 실제 GitHub 응답은
   * `verify:p6` 가 이미 관통했고, 토큰 없이 시간당 60회라 E2E 에서 매번
   * 부르면 다른 검증이 한도에 걸립니다 — 여기서는 «화면이 작업을 만들었는가»
   * 가 확인할 것입니다.
   */
  await expect
    .poll(
      async () =>
        db.job.count({
          where: { resourceId: created.id, type: "FETCH_GITHUB_META" },
        }),
      { timeout: 20_000 }
    )
    .toBeGreaterThan(0);

  // 아카이브 패널이 화면에 있다 (`FR-GH-003`)
  await expect(page.getByText(/아카이브/).first()).toBeVisible();
});

/* ────────────────────────────────────────────────────────────────────────
 * ④ 권한 없는 사용자가 /admin 에 접근하면 차단
 * ──────────────────────────────────────────────────────────────────────── */
test("④ 일반 회원은 관리 영역에 못 들어간다", async ({ page }) => {
  const member = await makeUser({ tag: "member", role: "MEMBER" });
  await signIn(page, member.username);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

  /*
   * **세션 쿠키 속성** (`NFR-SEC-005`) — 여기서만 볼 수 있습니다.
   *
   * 스크립트로는 `writeSessionCookie` 의 인자를 «읽는» 것밖에 못 하는데,
   * 그건 코드로 코드를 확인하는 것이라 아무것도 증명하지 않습니다. 브라우저가
   * 실제로 받아 저장한 쿠키만이 증거입니다. `verify:sec` 이 이 항목을
   * 「e2e 가 증명한다」고 적어 두었으니, 그 말이 참이어야 합니다.
   */
  const cookieName = process.env.SESSION_COOKIE_NAME || "qb_session";
  const jar = await page.context().cookies();
  const session = jar.find((c) => c.name === cookieName);
  expect(session, `${cookieName} 쿠키가 없습니다`).toBeDefined();
  expect(session!.httpOnly).toBe(true);
  expect(session!.sameSite).toBe("Lax");
  /*
   * 1단계는 `http` 라 `Secure` 가 꺼져 있어야 «맞습니다» — 켜져 있으면
   * 브라우저가 쿠키를 아예 안 보내 로그인이 안 됩니다 (`DEC-013`·`017`).
   * 2단계에서 `COOKIE_SECURE=true` 로 바꾸면 이 단언도 함께 뒤집힙니다.
   */
  expect(session!.secure).toBe(process.env.COOKIE_SECURE === "true");

  // 사이드바에 관리자 입구가 없다
  await expect(page.getByRole("link", { name: "관리자" })).toHaveCount(0);

  for (const path of ["/admin", "/admin/members", "/admin/settings"]) {
    await page.goto(path);
    /*
     * **`/403` 으로 갑니다.** 관리 화면이 잠깐이라도 보이면 안 됩니다 —
     * 그 레이아웃은 승인 대기 수와 최근 자료를 싣습니다 (`DEC-057`).
     */
    await expect(page).toHaveURL(/\/403/, { timeout: 15_000 });
    await expect(page.getByText(/권한/).first()).toBeVisible();
  }

  // EDITOR 도 마찬가지 — 관리 영역은 통째로 ADMIN 입니다 (`DEC-057`)
  const editor = await makeUser({ tag: "editor", role: "EDITOR" });
  const other = await page.context().browser()!.newPage();
  await signIn(other, editor.username);
  await other.goto("/admin/taxonomy");
  await expect(other).toHaveURL(/\/403/, { timeout: 15_000 });
  await other.close();
});

/* ────────────────────────────────────────────────────────────────────────
 * ⑤ 관리자 정지 → 즉시 로그아웃 + API 키 무효
 * ──────────────────────────────────────────────────────────────────────── */
test("⑤ 정지하면 그 사람의 세션과 API 키가 즉시 죽는다", async ({ page }) => {
  const victim = await makeUser({ tag: "victim", role: "EDITOR" });

  // 본인이 «화면에서» 키를 발급합니다
  await signIn(page, victim.username);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
  await page.goto("/me");
  await page.getByRole("tab", { name: "보안" }).click();
  await page.getByRole("button", { name: /키 발급/ }).click();
  await page.getByLabel(/이름/).last().fill("E2E 키");
  await page.getByRole("button", { name: /발급/ }).last().click();

  const plainKey = await page
    .locator("code")
    .filter({ hasText: /^qb_/ })
    .first()
    .textContent();
  expect(plainKey).toMatch(/^qb_/);

  // 그 키가 실제로 통한다
  const before = await fetch(`${BASE_URL}/api/ingest/whoami`, {
    headers: { authorization: `Bearer ${plainKey!.trim()}` },
  });
  expect(before.status).toBe(200);

  /*
   * **관리자가 화면에서 정지시킵니다.** 사유 10자 이상이 필수입니다
   * (`FR-ADM-004` 수용 기준).
   */
  const admin = await makeUser({ tag: "suspender", role: "ADMIN" });
  const adminPage = await page.context().browser()!.newPage();
  await signIn(adminPage, admin.username);
  await adminPage.goto(`/admin/members`);
  /*
   * **기본 탭은 「승인 대기」입니다.** victim 은 ACTIVE 라 거기에 없습니다 —
   * 처음에는 이걸 몰라 「행이 없다」로 60초를 기다리다 끝났습니다.
   * 「전체」로 옮기고, 검색으로 좁혀서 행을 하나로 만듭니다.
   */
  await adminPage.getByRole("tab", { name: /전체/ }).click();
  await adminPage.getByPlaceholder(/이름 · 아이디 검색/).fill(victim.username);
  const row = adminPage.getByRole("row").filter({ hasText: victim.username });
  // 화면의 라벨은 「더보기」입니다 (띄어쓰기 없음)
  await row.getByRole("button", { name: "더보기" }).first().click();
  await adminPage.getByRole("menuitem", { name: "정지" }).click();
  await adminPage.getByLabel("사유").fill("E2E 시나리오 ⑤ 정지 확인용입니다");
  await adminPage.getByRole("button", { name: "정지" }).last().click();
  await expect(adminPage.getByText(/정지했습니다/)).toBeVisible({
    timeout: 15_000,
  });
  await adminPage.close();

  // 세션이 즉시 끊긴다
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

  /*
   * **API 키도 즉시 무효입니다** — 폐기한 것이 아니라 `verifyKey` 가 매 요청
   * 소유자 상태를 보기 때문입니다 (`DEC-037`). 정지를 풀면 그대로 살아납니다.
   */
  const after = await fetch(`${BASE_URL}/api/ingest/whoami`, {
    headers: { authorization: `Bearer ${plainKey!.trim()}` },
  });
  expect(after.status).toBe(401);
});

/* ────────────────────────────────────────────────────────────────────────
 * ⑥ API 키로 Ingest 등록 → 목록에 즉시 노출 → source_channel = MCP
 * ──────────────────────────────────────────────────────────────────────── */
test("⑥ CLI 로 넣은 자료가 화면에 «CLI 수집»으로 뜬다", async ({ page }) => {
  const collector = await makeUser({ tag: "cli", role: "EDITOR" });

  // 화면에서 키를 발급받습니다
  await signIn(page, collector.username);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
  await page.goto("/me");
  await page.getByRole("tab", { name: "보안" }).click();
  await page.getByRole("button", { name: /키 발급/ }).click();
  await page.getByLabel(/이름/).last().fill("E2E 수집 키");
  await page.getByRole("button", { name: /발급/ }).last().click();
  const key = (
    await page.locator("code").filter({ hasText: /^qb_/ }).first().textContent()
  )!.trim();

  // 그 키로 «HTTP 로» 등록합니다 — CLI 가 하는 그대로
  const title = `E2E CLI 등록 ${Date.now().toString(36)}`;
  const res = await fetch(`${BASE_URL}/api/ingest/resources`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      type: "DEV_NOTE",
      title,
      noteKind: "TIP",
      summary: "에이전트가 넣은 자료",
    }),
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { data: { slug: string } };

  /*
   * **「즉시 노출」이 이 시나리오의 요점입니다.** 검수 대기 같은 중간 상태가
   * 없습니다 (`DEC-029`) — 넣은 그 순간 목록에 있어야 합니다.
   */
  await page.goto("/resources");
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 15_000 });

  // 상세에서 «CLI 수집»으로 구분된다
  await page.goto(`/resources/dev-note/${body.data.slug}`);
  await expect(page.getByText("CLI 수집").first()).toBeVisible();
  await expect(page.getByText("CLI (MCP)")).toBeVisible();

  const row = await db.resource.findFirstOrThrow({
    where: { title },
    select: { sourceChannel: true },
  });
  expect(row.sourceChannel).toBe("MCP");
});
