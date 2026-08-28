import type { Metadata } from "next";

import { ChangePasswordForm } from "@/features/auth/components/change-password-form";

export const metadata: Metadata = { title: "비밀번호 변경" };

/** SCR-006 초기 비밀번호 변경 */
export default function ChangePasswordPage() {
  return <ChangePasswordForm />;
}
