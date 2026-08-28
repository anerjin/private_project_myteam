import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import {
  MemberTable,
  type MemberRow,
} from "@/features/members/components/member-table";
import { requireRole } from "@/server/auth/guards";
import * as memberRepo from "@/server/repositories/member.repository";

export const metadata: Metadata = { title: "회원 관리" };

/** SCR-211 회원 관리 */
export default async function AdminMembersPage() {
  // 실제 인가는 여기서 한다 — 레이아웃이 아니라 page 다 (DEC-035)
  await requireRole("ADMIN");

  const members = await memberRepo.list();

  // Date 는 클라이언트 컴포넌트로 넘길 때 직렬화되지만, 표시 형식을 서버에서
  // 고정해 두면 타임존 차이로 하이드레이션이 어긋나지 않는다.
  const rows: MemberRow[] = members.map((m) => ({
    id: m.id,
    username: m.username,
    name: m.name,
    department: m.department,
    role: m.role,
    status: m.status,
    signupReason: m.signupReason,
    createdAt: m.createdAt.toISOString(),
  }));

  return (
    <>
      <PageHeader
        title="회원 관리"
        description="가입 신청을 승인하고 역할·상태를 관리합니다. 모든 처리는 감사 로그에 남습니다."
        count={rows.length}
      />
      <MemberTable members={rows} />
    </>
  );
}
