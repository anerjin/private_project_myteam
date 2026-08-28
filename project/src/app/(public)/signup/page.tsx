import type { Metadata } from "next";

import { SignupForm } from "@/features/auth/components/signup-form";

export const metadata: Metadata = { title: "회원가입" };

/** SCR-002 회원가입 */
export default function SignupPage() {
  return (
    <div className="mx-auto w-full max-w-md">
      <SignupForm />
    </div>
  );
}
