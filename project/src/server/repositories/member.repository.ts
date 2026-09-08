import "server-only";

import type { Prisma, UserStatus } from "@prisma/client";

import { db } from "@/lib/db";

/**
 * 관리자 회원 관리 조회 (FR-ADM-002~).
 *
 * **Prisma 쿼리만 둡니다.** 「승인해도 되는가」·「마지막 관리자인가」 같은 판단은
 * service 의 일입니다 (`DEV-06 · 6.6절`).
 *
 * `user.repository.ts` 와 나눈 이유: 그쪽은 인증 경로(아이디 조회·생성)이고
 * 여기는 관리자 화면의 목록·필터입니다. 한 파일에 섞으면 인증 경로를 고칠 때
 * 관리자 쿼리까지 읽어야 합니다.
 */

export interface MemberFilter {
  status?: UserStatus;
  /** 아이디·이름 부분 일치 */
  q?: string;
}

/** 목록에 필요한 것만. `passwordHash` 는 절대 나가지 않는다 */
export const MEMBER_SELECT = {
  id: true,
  username: true,
  name: true,
  department: true,
  status: true,
  statusReason: true,
  statusChangedAt: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type MemberListItem = Prisma.UserGetPayload<{
  select: typeof MEMBER_SELECT;
}>;

function toWhere(filter: MemberFilter): Prisma.UserWhereInput {
  return {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.q
      ? {
          OR: [
            { username: { contains: filter.q, mode: "insensitive" } },
            { name: { contains: filter.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export function list(filter: MemberFilter = {}): Promise<MemberListItem[]> {
  return db.user.findMany({
    where: toWhere(filter),
    select: MEMBER_SELECT,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

export function countByStatus(): Promise<
  { status: UserStatus; _count: number }[]
> {
  return db.user
    .groupBy({ by: ["status"], _count: { _all: true } })
    .then((rows) =>
      rows.map((r) => ({ status: r.status, _count: r._count._all }))
    );
}

export function findDetail(id: string): Promise<MemberListItem | null> {
  return db.user.findUnique({ where: { id }, select: MEMBER_SELECT });
}

/**
 * 지금 로그인할 수 있는 계정 수.
 *
 * 🔄 옛 이름은 `countActiveAdmins` 였고 `role: "ADMIN"` 을 함께 봤습니다.
 *    `DEC-077` 로 등급이 사라져 **조건이 상태 하나**로 줄었습니다.
 *
 * **`ACTIVE` 인 것만 셉니다.** 정지된 계정은 로그인할 수 없으므로
 * 「마지막 하나인가」 판정에서 세어 주면 안 됩니다 — 그러면 남은 활성 계정을
 * 정지시켜도 통과해 아무도 못 들어오는 상태가 됩니다 (`FR-ADM-009`).
 */
export function countActiveUsers(tx: Prisma.TransactionClient = db) {
  return tx.user.count({ where: { status: "ACTIVE" } });
}

/*
 * **`updateStatus()` 를 두지 않습니다** (`DEC-044`).
 *
 * `status` 로 가는 setter 를 여기 두면 그것이 **두 번째 문**이 됩니다.
 * 누군가 `memberRepo.updateStatus(id, { status: "ACTIVE" })` 한 줄을 부르면
 * advisory 락도, 마지막 관리자 재판정도, 세션 삭제도, 캐시 무효화도, 감사 로그도
 * 없이 상태가 바뀝니다 (`DEC-036` 이 막으려는 전부).
 *
 * 실제로 호출자 0인 채로 존재했고, 인자를 보던 옛 검사기는 이것을 보지 못했습니다.
 * 전이는 `member.service.transition` 이 직접 씁니다 — **문은 하나입니다.**
 */
