import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { Pagination } from "@/components/common/pagination";
import { AuditFilters } from "@/features/audit/components/audit-filters";
import { AuditTable } from "@/features/audit/components/audit-table";
import { PurgeAuditButton } from "@/features/audit/components/purge-audit-button";
import {
  auditFilterToQuery,
  hasAnyFilter,
  parseAuditFilter,
} from "@/features/audit/filter.schema";
import { pageSchema } from "@/features/resources/list.schema";
import { requireActiveUser } from "@/server/auth/guards";
import * as audit from "@/server/services/audit.service";
import type { AuditLog } from "@/types";

export const metadata: Metadata = { title: "감사 로그" };

const PAGE_SIZE = 50;

/**
 * SCR-251 감사 로그 (`FR-AUDIT-002`).
 *
 * **오프셋 페이지네이션의 첫 소비자입니다** (`DEC-045`). 관리자는 「총 N건 중
 * 2페이지」를 알아야 하고 특정 페이지로 점프합니다 — 탐색 화면은 커서를 씁니다.
 *
 * **필터는 주소에 있습니다** — 페이지를 넘겨도 유지되고, 「이 사람의 8월
 * 로그」를 링크로 건넬 수 있습니다. 클라이언트 필터로 두면 서버 페이징 때문에
 * 「현재 페이지 안에서만」 걸려 거짓말을 합니다.
 */
export default async function AdminAuditLogsPage({
  searchParams,
}: PageProps<"/admin/audit-logs">) {
  // 실제 인가는 여기서 한다 — 레이아웃이 아니라 page 다 (DEC-035)
  await requireActiveUser();

  const sp = await searchParams;
  const page = pageSchema.parse(Array.isArray(sp.page) ? sp.page[0] : sp.page);
  const filter = parseAuditFilter(sp);

  const [result, actors] = await Promise.all([
    audit.list({ page, size: PAGE_SIZE, filter }),
    audit.listActors(),
  ]);

  // 화면 DTO 로 바꾸는 것도 경계에서 한 번 (Date → ISO)
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
        action={<PurgeAuditButton />}
      />

      <AuditFilters current={filter} actors={actors} />

      {/*
        **「0건」과 「필터 때문에 0건」을 구별해 말합니다.**
        거른 뒤 빈 화면만 보이면 관리자는 기록이 없는 줄 압니다.
      */}
      {result.total === 0 && hasAnyFilter(filter) ? (
        <p className="text-muted-foreground rounded-lg border py-10 text-center text-sm">
          이 조건에 맞는 기록이 없습니다. 조건을 넓혀 보세요.
        </p>
      ) : (
        <AuditTable logs={logs} />
      )}

      <Pagination
        page={page}
        total={result.total}
        size={PAGE_SIZE}
        hrefFor={(n) =>
          `/admin/audit-logs${auditFilterToQuery(filter, n > 1 ? { page: n } : {})}`
        }
      />
    </>
  );
}
