"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import {
  MOCK_SESSION_COOKIE,
  SWITCHABLE_USERS,
} from "@/features/auth/mock-session";

/**
 * 프로토타입용 사용자 전환. 인증이 붙으면 삭제합니다.
 * 쿠키는 서버에서 설정합니다 — 화면에서 상태를 바꾸는 일은 Server Action 으로 (DEC-009).
 */
export async function switchMockUserAction(username: string) {
  if (!(SWITCHABLE_USERS as readonly string[]).includes(username)) return;

  const store = await cookies();
  store.set(MOCK_SESSION_COOKIE, username, {
    path: "/",
    maxAge: 60 * 60 * 24,
    httpOnly: false,
    sameSite: "lax",
  });

  revalidatePath("/", "layout");
}
