import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { ResourceBrowser } from "@/features/resources/components/resource-browser";
import { resources } from "@/mocks";
import { requireActiveUser } from "@/server/auth/guards";

export const metadata: Metadata = { title: "전체 자료" };

/** SCR-111 자료 목록 (전체) */
export default async function ResourcesPage() {
  // 인가는 레이아웃이 아니라 page 가 한다 (DEC-035)
  await requireActiveUser();

  return (
    <>
      <PageHeader
        description="팀이 모은 모든 자료입니다. 승인된 회원은 전부 열람할 수 있습니다."
        count={resources.length}
        action={
          <Button asChild>
            <Link href="/resources/new">
              <Plus className="size-4" />
              자료 등록
            </Link>
          </Button>
        }
      />
      <ResourceBrowser resources={resources} />
    </>
  );
}
