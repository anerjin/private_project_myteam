import { cookies } from "next/headers";

import { members } from "@/mocks";
import type { Member } from "@/types";

export const MOCK_SESSION_COOKIE = "qb_mock_user";

/** 전환기에 띄울 후보 — 역할별로 하나씩 */
export const SWITCHABLE_USERS = ["jaehyun", "minsu", "seoyeon"] as const;

const FALLBACK = members.find((m) => m.username === "jaehyun")!;

/**
 * 프로토타입용 세션.
 *
 * 실제 구현에서는 Auth.js 세션을 읽습니다. 지금은 **쿠키로 흉내** 내는데,
 * 쿠키를 쓰는 이유는 서버 컴포넌트에서도 역할을 알아야 하기 때문입니다.
 * 권한 판정은 화면이 아니라 서버에서 해야 합니다 (REQ-02 · 2.1절).
 */
export async function getMockSession(): Promise<Member> {
  const store = await cookies();
  const username = store.get(MOCK_SESSION_COOKIE)?.value;
  return members.find((m) => m.username === username) ?? FALLBACK;
}

/** 자료를 수정·삭제할 수 있는가 (REQ-02 · 2.5절) */
export function canEditResource(actor: Member, authorId: string) {
  return actor.role !== "MEMBER" || actor.id === authorId;
}

/** 검수 대기를 해제할 수 있는가 (FR-RES-017) */
export function canResolveReview(actor: Member, authorId: string) {
  return canEditResource(actor, authorId);
}
