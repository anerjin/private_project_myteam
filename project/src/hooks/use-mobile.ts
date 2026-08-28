import * as React from "react";

/**
 * shadcn 이 생성한 원본을 고쳤습니다.
 *
 * 원본은 `useEffect` 안에서 곧바로 `setState` 를 불렀는데, Next.js 16 이 기본으로 켜는
 * `react-hooks/set-state-in-effect` 규칙에 걸려 **`npm run lint` 가 실패**했습니다.
 * (CI 실패는 머지 차단 — `NFR-MAINT-002`)
 *
 * 미디어 쿼리는 "외부 스토어를 구독하는" 전형적인 경우라 `useSyncExternalStore` 로 바꿨습니다.
 * 서버 스냅샷은 `false`(데스크톱)로 고정해 하이드레이션 불일치도 함께 막습니다.
 */
const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onStoreChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false
  );
}
