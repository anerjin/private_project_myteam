import "server-only";

import type { Prisma, User } from "@prisma/client";

import { db } from "@/lib/db";

/**
 * 회원 조회·저장 (DEV-06 · 6.6절).
 *
 * **Prisma 쿼리만 둡니다.** 비즈니스 판단(승인 가능한가, 마지막 관리자인가)은
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
 * 아이디가 이미 쓰이는가 (FR-AUTH-002).
 *
 * **`users` 와 `reserved_usernames` 를 모두 봅니다.** 한쪽만 보면
 * 탈퇴 후 익명화된 계정의 아이디가 재사용되어 과거 기록의 주체가 뒤바뀝니다
 * (`DEC-021`, `DEV-02 · 2.7절`).
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

export function create(data: Prisma.UserCreateInput): Promise<User> {
  return db.user.create({ data });
}

export function touchLastLogin(id: string): Promise<User> {
  return db.user.update({
    where: { id },
    data: { lastLoginAt: new Date() },
  });
}
