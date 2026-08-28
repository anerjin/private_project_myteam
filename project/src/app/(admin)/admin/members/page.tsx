import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { MemberTable } from "@/features/members/components/member-table";
import { members } from "@/mocks";

export const metadata: Metadata = { title: "회원 관리" };

/** SCR-211 회원 관리 */
export default function AdminMembersPage() {
  return (
    <>
      <PageHeader
        title="회원 관리"
        description="가입 신청을 승인하고 역할·상태를 관리합니다. 모든 처리는 감사 로그에 남습니다."
        count={members.length}
      />
      <MemberTable />
    </>
  );
}
