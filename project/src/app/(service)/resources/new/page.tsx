import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { QuickAddUrl } from "@/features/resources/components/quick-add-url";
import { ResourceForm } from "@/features/resources/components/resource-form";

export const metadata: Metadata = { title: "자료 등록" };

/** SCR-113 자료 등록 */
export default function NewResourcePage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="자료 등록"
        description="타입을 고르면 그에 맞는 입력 항목이 나타납니다."
      />
      {/* URL 빠른 등록(FR-RES-005). 대시보드에서 이 화면으로 옮겼습니다. */}
      <QuickAddUrl />
      <ResourceForm />
    </div>
  );
}
