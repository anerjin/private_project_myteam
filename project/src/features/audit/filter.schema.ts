import { z } from "zod";

import { AUDIT_ACTIONS } from "@/features/audit/actions";

/**
 * 감사 로그 필터 파서 (`FR-AUDIT-002`).
 *
 * ## 필터는 **주소에** 있습니다
 *
 * 컴포넌트 상태가 아니라 쿼리스트링입니다. 그래야 ① 페이지를 넘겨도 필터가
 * 유지되고 ② 「이 사람의 8월 로그」를 **링크로 건넬 수 있고** ③ 새로고침이
 * 결과를 안 바꿉니다. 자료 목록(`list.schema.ts`)이 같은 자리에서 내린
 * 판단과 같습니다.
 *
 * ## 못 알아듣는 값은 **버립니다**
 *
 * 주소는 사람이 손으로 고칩니다. `action=NOPE` 에 오류 화면을 띄우면
 * 관리자는 무엇을 고쳐야 하는지 모릅니다 — 그 칸만 없는 것으로 보고
 * 나머지로 거릅니다. 「거른 것」과 「못 알아들은 것」의 구별은 화면이
 * **지금 걸린 필터를 다시 보여주는 것**으로 합니다.
 */

/** `YYYY-MM-DD` 만. 그 밖은 버린다 */
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);

const optional = z.string().trim().min(1).optional().catch(undefined);

export const auditFilterSchema = z.object({
  actor: optional,
  action: z.enum(AUDIT_ACTIONS).optional().catch(undefined),
  via: z.enum(["WEB", "MCP"]).optional().catch(undefined),
  from: dateOnly,
  to: dateOnly,
});

export type AuditFilterInput = z.infer<typeof auditFilterSchema>;

/**
 * `searchParams` → 필터.
 *
 * 배열로 온 값(`?actor=a&actor=b`)은 **첫 번째만** 씁니다 — 두 값을 합치면
 * 「누구의 것도 아닌」 결과가 나옵니다.
 */
export function parseAuditFilter(
  sp: Record<string, string | string[] | undefined>
): AuditFilterInput {
  const first = Object.fromEntries(
    Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );
  return auditFilterSchema.parse(first);
}

/**
 * 필터를 다시 주소로.
 *
 * **페이지 번호를 여기서 만들지 않습니다** — 필터가 바뀌면 1페이지로
 * 돌아가야 하고, 그 판단은 부르는 쪽에 있습니다.
 */
export function auditFilterToQuery(
  filter: AuditFilterInput,
  extra: Record<string, string | number | undefined> = {}
): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...filter, ...extra })) {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/** 지금 무언가로 걸러져 있는가 — 「전체 해제」 버튼을 띄울지 판단한다 */
export function hasAnyFilter(filter: AuditFilterInput): boolean {
  return Object.values(filter).some((v) => v !== undefined);
}
