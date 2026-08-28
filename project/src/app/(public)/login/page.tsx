import type { Metadata } from "next";

import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = { title: "로그인" };

/** SCR-001 로그인 */
export default function LoginPage() {
  return (
    <div className="mx-auto w-full max-w-sm">
      <LoginForm />
    </div>
  );
}
