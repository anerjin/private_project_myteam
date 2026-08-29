import "server-only";

import { AppError } from "@/lib/errors";
import * as userRepo from "@/server/repositories/user.repository";

/**
 * 회원 프로필 (FR-USER-001~).
 *
 * **세션 DTO 와 프로필은 다릅니다.** 세션은 인가 판정에 필요한 최소값만 담고,
 * 가입일·자기소개처럼 화면에만 필요한 값은 여기서 다시 읽습니다.
 * 세션 DTO 를 넓히면 매 요청 캐시에 실려 다니는 값이 늘어납니다.
 */

export interface Profile {
  id: string;
  username: string;
  name: string;
  department: string | null;
  bio: string | null;
  role: "MEMBER" | "EDITOR" | "ADMIN";
  status: "PENDING" | "ACTIVE" | "REJECTED" | "SUSPENDED" | "WITHDRAWN";
  createdAt: Date;
  lastLoginAt: Date | null;
}

export async function getProfile(userId: string): Promise<Profile> {
  const user = await userRepo.findById(userId);
  if (!user) throw new AppError("NOT_FOUND", "계정을 찾을 수 없습니다.");

  // 필요한 것만 골라 내보낸다. `passwordHash` 가 화면까지 흘러가면 안 된다.
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    department: user.department,
    bio: user.bio,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

/**
 * 프로필 수정 (`FR-USER-002`).
 *
 * **아이디는 못 바꿉니다.** 감사 로그가 `actor_username` 을 스냅샷으로
 * 갖고 있고(`DEC-021`), 아이디가 바뀌면 옛 기록이 다른 사람을 가리키는
 * 것처럼 보입니다. `reserved_usernames` 도 「이 아이디는 영원히 그 사람의
 * 것」이라는 전제 위에 있습니다.
 *
 * 감사 로그를 남기지 **않습니다.** `REQ-02 · 2.10` 의 기록 대상은 권한·계정
 * 상태·자료이고, 본인이 자기 소개를 고치는 것은 그 목록에 없습니다 —
 * 전부 남기면 정작 봐야 할 줄이 묻힙니다.
 */
export async function updateProfile(
  userId: string,
  input: { name: string; department?: string | null; bio?: string | null }
): Promise<void> {
  await userRepo.updateProfile(userId, input);
}
