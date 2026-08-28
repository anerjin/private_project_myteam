import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signOutAction } from "@/server/actions/auth.actions";

/**
 * 로그아웃 (API-005).
 *
 * 프로토타입의 «사용자 전환기»를 대체합니다. 역할별 화면은 실제로
 * 로그아웃했다가 다른 계정으로 로그인해서 봅니다 — 그 경로가 곧 E2E ①·④ 입니다.
 *
 * `form action` 이라 **자바스크립트 없이도 동작**합니다 (`NFR-A11Y-002`).
 */
export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
      >
        <LogOut className="size-4" />
        로그아웃
      </Button>
    </form>
  );
}
