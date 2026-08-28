import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { getSession } from "@/server/auth/guards";

export const metadata: Metadata = { title: "비밀번호 변경" };

/** SCR-006 초기 비밀번호 변경 */
export default async function ChangePasswordPage() {
  /*
   * **로그인은 되어 있어야 합니다.** `(public)` 그룹에 있지만 공개 화면이 아닙니다 —
   * `requireActiveUser()` 를 쓰면 `mustChangePassword` 때문에 자기 자신으로
   * 무한 리다이렉트하므로 `getSession()` 으로 직접 확인합니다.
   */
  const session = await getSession();
  if (!session) redirect("/login");

  // 이미 바꾼 사람이 주소를 직접 치고 들어온 경우
  if (!session.mustChangePassword) redirect("/dashboard");

  return <ChangePasswordForm />;
}
