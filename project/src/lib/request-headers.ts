/**
 * `proxy.ts` 와 서버 컴포넌트가 **함께 쓰는 헤더 이름.**
 *
 * `lib/session-cookie.ts` 와 **같은 자리·같은 이유**입니다. 그 파일 주석이
 * *"`proxy.ts` 도 import 하는 유일한 모듈"* 이라고 적어 둔 그 규약입니다.
 *
 * 상수 하나 때문에 서버 컴포넌트가 `@/proxy` 를 import 하면 라우트 미들웨어 모듈
 * (`next/server` · `config.matcher` · `proxy()` 본문)이 **RSC 그래프에 들어옵니다.**
 * `check-deps` 와 `DEC-035` 는 **proxy 의 «나가는» import** 만 보고 들어오는 쪽은
 * 규칙이 없어서 조용히 통과합니다 — 그래서 규칙이 아니라 **자리**로 막습니다.
 */

/**
 * 현재 경로. 레이아웃은 `usePathname` 을 쓸 수 없고 `params` 도 못 받는데,
 * 빵부스러기의 동적 세그먼트 라벨은 레이아웃이 만들어 넘겨야 합니다.
 *
 * **`proxy` 가 매 요청 덮어씁니다** — 클라이언트가 같은 헤더를 보내도 무시됩니다.
 */
export const PATHNAME_HEADER = "x-neowave-work-pathname";
