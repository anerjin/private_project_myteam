"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

/**
 * 앱 테마 — **한 번 눌러 바꿉니다** (`DEC-068`).
 *
 * ## 왜 목록이 아니라 토글인가
 *
 * 「라이트·다크·시스템」 셋을 드롭다운으로 골랐었습니다. 실제로 하는 일은
 * «지금의 반대쪽»뿐인데 두 번(열고, 고르고) 눌러야 했습니다. 도우미 패널의
 * 밝기 단추(`features/chat/components/chat-panel`)와 결도 달랐습니다.
 *
 * **대가는 「시스템 따라가기」입니다.** 처음 들어온 사람은 여전히 OS 설정을
 * 따르지만(`defaultTheme="system"`), 한 번 누르는 순간 밝음·어둠에 «명시적으로»
 * 고정되고 이 화면에는 시스템으로 되돌릴 자리가 없습니다. 되돌리려면 브라우저
 * 저장소의 `theme` 을 지워야 합니다 — 그래서 결정으로 남겼습니다.
 *
 * ## 지금 테마를 «그려서» 판단하지 않습니다
 *
 * `resolvedTheme` 은 서버 렌더와 클라이언트 첫 렌더에서 `undefined` 입니다.
 * 그것으로 아이콘·글자를 고르면 하이드레이션이 어긋나고, **첫 페인트에 해가
 * 달로 바뀌는 것이 눈에 보입니다.**
 *
 * 그래서 아이콘도 이름도 **CSS 가 고릅니다.** `next-themes` 가 첫 페인트 «전»에
 * 인라인 스크립트로 붙여 둔 클래스를 그대로 따르므로 깜빡임이 없습니다.
 * 누를 때는 이야기가 다릅니다 — 그때는 이미 하이드레이션이 끝났으니
 * `resolvedTheme` 을 그냥 읽습니다.
 *
 * 읽어 주는 이름도 CSS 를 탑니다. lucide 아이콘은 `aria-hidden` 이라
 * (`children` 도 a11y 속성도 없을 때 스스로 붙입니다) **이름은 아래 두 칸에서만**
 * 나옵니다. `aria-label` 을 달면 그 둘을 덮어 「테마 변경」이라는 뭉뚱그린 말만
 * 남으므로 달지 않습니다.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
      <span className="sr-only dark:hidden">어둡게 보기</span>
      <span className="sr-only hidden dark:inline">밝게 보기</span>
    </Button>
  );
}
