import { defineConfig, devices } from "@playwright/test";

/**
 * E2E 설정 (`NFR-MAINT-004`, `DEV-01 · 1.10` 테스트 스택).
 *
 *   npm run e2e            (`npm run dev` 가 떠 있어야 합니다)
 *   npm run e2e -- --ui    브라우저를 보며
 *
 * ## 왜 브라우저인가
 *
 * 여태 검증(`verify:p3`~`p8`)은 **HTTP 로 화면을 그려 보고 service 를 직접**
 * 불렀습니다. 그 사이에 **Server Action 이 통째로 빠져 있습니다** — 폼 제출,
 * 버튼, 낙관적 갱신, 리다이렉트. 사용자가 겪는 쓰기 경로 전부입니다.
 *
 * E2E 여섯은 그 구멍만 메웁니다. 이미 관통한 것을 다시 만들지 않습니다 —
 * 예를 들어 시나리오 ⑥의 Ingest 등록은 `verify:p7-mcp` 가 stdio 로 이미
 * 증명했으므로, 여기서는 **그것이 화면에 나타나는지**만 봅니다.
 *
 * ## 서버를 띄우지 않습니다
 *
 * `webServer` 를 두면 이미 떠 있는 dev 서버와 포트가 부딪히고, 켜고 끄는 데
 * 매번 30초가 듭니다. **떠 있는 것에 붙습니다** — 안 떠 있으면 그 사실이
 * 첫 줄에서 분명하게 드러납니다.
 *
 * ## 한 번에 하나씩
 *
 * `workers: 1` 입니다. 여섯 시나리오가 **같은 DB** 를 쓰고, 그중 둘이
 * 계정 상태를 바꿉니다(정지·승인) — 병렬로 돌리면 서로의 상태를 밟습니다.
 * 여섯 개짜리 묶음에서 병렬은 벌지 못하는 값입니다.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    locale: "ko-KR",
    // 실패한 것만 흔적을 남깁니다 — 통과한 것의 스크린샷은 아무도 안 봅니다
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        /*
         * **온전한 Chromium 을 씁니다** (`OPEN-019`).
         *
         * 안 적으면 Playwright 는 `chromium_headless_shell` — 헤드리스 전용으로
         * 깎아 낸 바이너리 — 를 고릅니다. 그것이 **로그인 직후 `/dashboard`
         * 에서 렌더러째 죽습니다**: `Navigation failed because page crashed!`.
         *
         * 실측(2026-09-08): 기본값이면 17건 중 **10건 실패**, 이 한 줄을 더하면
         * **5건**으로 줍니다. 같은 탐침을 `channel: "chromium"` 으로 돌리면
         * 로그인 → 대시보드 → `networkidle` 이 그대로 통과합니다.
         *
         * **이 줄이 없는 동안 `npm run e2e` 는 빨간 채로 방치돼 있었습니다** —
         * `P9` 가 「E2E 6종 통과」로 닫힌 뒤 아무도 안 돌렸습니다. 게이트는
         * 돌려야 게이트입니다.
         */
        channel: "chromium",
      },
    },
  ],
});
