import { Download } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { AuditTable } from "@/features/audit/components/audit-table";
import { auditLogs } from "@/mocks";

export const metadata: Metadata = { title: "감사 로그" };

/** SCR-251 감사 로그 */
export default function AdminAuditLogsPage() {
  return (
    <>
      <PageHeader
        title="감사 로그"
        description="권한·계정·자료 관련 행위를 모두 기록합니다. 행을 누르면 변경 전·후를 볼 수 있습니다."
        count={auditLogs.length}
        action={
          <Button variant="outline" size="sm">
            <Download className="size-4" />
            CSV 내보내기
          </Button>
        }
      />
      <AuditTable logs={auditLogs} />
    </>
  );
}
