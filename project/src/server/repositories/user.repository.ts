import "server-only";

import type { User } from "@prisma/client";

import { db } from "@/lib/db";

/**
 * 회원 조회·저장 (DEV-06 · 6.6절).
 *
 * **Prisma 쿼리만 둡니다.** 비즈니스 판단(정지해도 되는가, 마지막 관리자인가)은
 * service 계층의 일입니다. 여기에 `if` 가 늘기 시작하면 계층이 무너집니다.
 */

/** 로그인용 조회. 아이디는 이미 소문자로 정규화된 값이 들어온다 */
export function findByUsername(username: string): Promise<User | null> {
  return db.user.findUnique({ where: { username } });
}

export function findById(id: string): Promise<User | null> {
  return db.user.findUnique({ where: { id } });
}

/**
 * 아이디가 이미 쓰이는가.
 *
 * **`users` 와 `reserved_usernames` 를 모두 봅니다.** 한쪽만 보면
 * 탈퇴 후 익명화된 계정의 아이디가 재사용되어 과거 기록의 주체가 뒤바뀝니다
 * (`DEC-021`, `DEV-02 · 2.7절`).
 *
 * > **앱에는 부르는 곳이 없습니다** (`DEC-077`). 가입 폼이 사라지면서 계정을
 * > 만드는 길은 `prisma/seed.ts` 하나가 됐고, 그쪽은 `upsert` 라 이 함수를
 * > 지나지 않습니다. 즉 `reserved_usernames` 는 지금 **쓰기만 하고 아무도 읽지
 * > 않는 표**입니다 — `member.service.anonymizeWithdrawn` 이 채우고 끝입니다.
 * > 이 함수는 그 사실을 확인하는 검증 스크립트(`verify-p8`·`verify-empty-db`)가
 * > 부릅니다. **표를 지울지 시드가 이 함수를 보게 할지는 별도 결정입니다** —
 * > 어느 쪽이든 「그 아이디는 다시 못 쓴다」가 실제로 강제되는지 정하는 일이고,
 * > 여기서 조용히 지우면 그 질문 자체가 사라집니다.
 */
export async function isUsernameTaken(username: string): Promise<boolean> {
  const [user, reserved] = await Promise.all([
    db.user.findUnique({ where: { username }, select: { id: true } }),
    db.reservedUsername.findUnique({
      where: { username },
      select: { username: true },
    }),
  ]);
  return user !== null || reserved !== null;
}

export function touchLastLogin(id: string): Promise<User> {
  return db.user.update({
    where: { id },
    data: { lastLoginAt: new Date() },
  });
}

/**
 * 프로필 수정 (`FR-USER-002`).
 *
 * **`status` 를 안 받습니다.** 그리로 가는 문은 `member.service.transition`
 * 하나뿐이고(`DEC-036`), 여기서 열어 주면 그것이 **두 번째 문**이 됩니다 —
 * advisory 락도, 마지막 활성 계정 재판정도, 세션 삭제도, 감사 로그도 없이
 * 상태가 바뀝니다.
 *
 * `updateStatus()` 를 두지 않기로 한 것과 같은 이유입니다 (`DEC-044`).
 */
export function updateProfile(
  id: string,
  input: { name: string; department?: string | null; bio?: string | null }
): Promise<User> {
  return db.user.update({
    where: { id },
    data: {
      name: input.name,
      ...(input.department !== undefined
        ? { department: input.department }
        : {}),
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
    },
  });
}
