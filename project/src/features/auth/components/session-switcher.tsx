import { ROLE_LABEL } from "@/config/site";
import { UserSwitcher } from "@/features/auth/components/user-switcher";
import { SWITCHABLE_USERS, getMockSession } from "@/features/auth/mock-session";
import { members } from "@/mocks";

/** 서버에서 후보를 만들어 클라이언트 전환기에 넘긴다 (프로토타입 전용) */
export async function SessionSwitcher() {
  const session = await getMockSession();
  const users = SWITCHABLE_USERS.map((username) => {
    const m = members.find((x) => x.username === username)!;
    return {
      username: m.username,
      name: m.name,
      roleLabel: ROLE_LABEL[m.role],
    };
  });

  return <UserSwitcher users={users} current={session.username} />;
}
