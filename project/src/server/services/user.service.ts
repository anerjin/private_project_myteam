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
