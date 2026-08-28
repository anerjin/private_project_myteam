import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/features/auth/components/login-form";
import { getSession } from "@/server/auth/guards";

export const metadata: Metadata = { title: "로그인" };

/** SCR-001 로그인 */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  /*
   * **「이미 로그인했으니 대시보드로」 판단은 여기서 합니다** (`DEC-035`).
   *
   * proxy 에 넣으면 세션이 지워진 사용자가 무한 루프에 빠집니다 —
   * proxy 는 쿠키만 보고 «있음 → 대시보드», DAL 은 «세션 무효 → 로그인».
   * DAL 은 세션을 실제로 조회하므로 죽은 쿠키를 여기서 걸러냅니다.
   */
  const session = await getSession();
  if (session) redirect("/dashboard");

  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;

  return (
    <div className="mx-auto w-full max-w-sm">
      <LoginForm next={next} />
    </div>
  );
}
