import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { Pagination } from "@/components/common/pagination";
import { AuditTable } from "@/features/audit/components/audit-table";
import { pageSchema } from "@/features/resources/list.schema";
import { requireRole } from "@/server/auth/guards";
import * as audit from "@/server/services/audit.service";
import type { AuditLog } from "@/types";

export const metadata: Metadata = { title: "감사 로그" };

const PAGE_SIZE = 50;

/**
 * SCR-251 감사 로그 (`FR-AUDIT-002`).
 *
 * **오프셋 페이지네이터의 첫 소비자입니다** (`DEC-045`). 관리자는 「총 N건 중
 * 2페이지」를 알아야 하고 특정 페이지로 점프합니다 — 탐색 화면의 커서와 다릅니다.
 *
 * `P3` 가 감사 로그를 트랜잭션 필수로 만들었는데 **읽을 방법이 없었습니다.**
 * 행위자·기간 필터와 CSV 내보내기는 `P8` 입니다 — 여기는 목록 + 페이징까지.
 */
export default async function AdminAuditLogsPage({
  searchParams,
}: PageProps<"/admin/audit-logs">) {
  // 실제 인가는 여기서 한다 — 레이아웃이 아니라 page 다 (DEC-035)
  await requireRole("ADMIN");

  const sp = await searchParams;
  const page = pageSchema.parse(Array.isArray(sp.page) ? sp.page[0] : sp.page);
  const result = await audit.list({ page, size: PAGE_SIZE });

  // 화면 DTO 로 옮긴다 — 경계에서 한 번 (Date → ISO)
  const logs: AuditLog[] = result.items.map((l) => ({
    id: l.id,
    actorUsername: l.actorUsername,
    via: l.via,
    action: l.action,
    targetType: l.targetType ?? undefined,
    summary: l.summary,
    ip: l.ip ?? "미기록",
    createdAt: l.createdAt.toISOString(),
    diff: (l.diff as AuditLog["diff"]) ?? undefined,
  }));

  return (
    <>
      <PageHeader
        title="감사 로그"
        description="권한·계정·자료 관련 행위를 모두 기록합니다. 행을 누르면 변경 전·후를 볼 수 있습니다."
        count={result.total}
      />
      <AuditTable logs={logs} />
      <Pagination
        page={page}
        total={result.total}
        size={PAGE_SIZE}
        hrefFor={(n) => `/admin/audit-logs${n > 1 ? `?page=${n}` : ""}`}
      />
    </>
  );
}
