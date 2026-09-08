"use client";

import { useSyncExternalStore } from "react";

/**
 * 📱 **좁은 폭에서는 간트의 제스처를 통째로 끕니다** (`DEC-075`).
 *
 * 원본(Orbee)은 저장소 공용 훅(`use-breakpoint`)의 `useDragEnabled` 를 씁니다.
 * 우리에게는 그 훅이 없고, 있는 것은 사이드바용 `useIsMobile`(768px)뿐입니다 —
 * **그것을 그대로 쓸 수는 없습니다.** 간트가 무너지는 폭은 「휴대폰인가」가
 * 아니라 「트리 288px + 타임라인이 함께 설 수 있는가」이고, 원본이 실측으로
 * 정한 그 값이 1280 입니다.
 *
 * 🔴 **`DESKTOP_MIN` 은 `project-gantt.tsx` 의 `max-xl:touch-auto` 와 같은
 *    폭이어야 합니다.** Tailwind 의 `xl` 이 1280px 이라 지금은 맞습니다.
 *    갈리면 둘 중 하나가 됩니다:
 *      - 여기가 더 좁으면 → 드래그가 살아 있는 폭에서 `touch-action` 이 풀려
 *        **드래그가 스크롤에 먹힙니다.**
 *      - 여기가 더 넓으면 → 드래그가 꺼진 폭에서 막대가 `touch-none` 인 채라
 *        **막대 위에서 손가락 스크롤이 죽습니다.**
 *    벤더가 막대에 `touch-none` 을 박아 두었고(`gantt-bar.tsx`) 막대의
 *    `onPointerDown` 이 `stopPropagation()` 을 무조건 부르므로, 그 상태에서는
 *    벤더의 패닝으로도 안 흘러갑니다 — 화면이 굳습니다.
 *
 * 🔴 **`useSyncExternalStore` 입니다.** 이 저장소의 `useIsMobile` 이 같은 이유로
 *    그렇게 서 있습니다 — `useEffect` 안에서 곧바로 `setState` 를 부르면
 *    `react-hooks/set-state-in-effect` 에 걸려 `npm run lint` 가 실패합니다.
 * ⚠️ 서버 스냅샷은 `true`(데스크톱)입니다. `useIsMobile` 이 `false`(= 데스크톱)를
 *    돌려주는 것과 **같은 뜻**이고, 값의 방향만 반대입니다.
 */
const DESKTOP_MIN = 1280;
const QUERY = `(min-width: ${DESKTOP_MIN}px)`;

function subscribe(onStoreChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

export function useDragEnabled(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => true
  );
}
