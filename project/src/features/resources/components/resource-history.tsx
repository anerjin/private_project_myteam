import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * 자료 변경 이력 (`FR-RES-013`).
 *
 * ## 이력 테이블을 새로 만들지 않습니다
 *
 * `audit_logs` 에 이미 `RESOURCE_CREATE`·`UPDATE`·`DELETE`·`RESTORE` 가
 * `target_id` 와 함께 남습니다. 별도 테이블을 두면 **같은 사실이 두 곳에
 * 쌓이고**, 둘이 어긋나는 날 어느 쪽이 진실인지 알 방법이 없습니다 —
 * 회원 상세의 「상태 변경 이력」에서 내린 것과 같은 판단입니다.
 *
 * ## 누구에게 보이는가
 *
 * **수정 권한이 있는 사람**입니다(작성자 + `EDITOR` 이상). 「누가 언제 뭘
 * 고쳤나」는 그 자료를 고칠 수 있는 사람이 알아야 하는 것이고, 아무나
 * 보면 «누가 무엇을 하는지»가 새어 나갑니다. 전체 기록은 `ADMIN` 의
 * 감사 로그에 있습니다.
 *
 * ## 변경 «내용»은 감사 로그에 있습니다
 *
 * 여기서는 언제·누가·무엇을 했는지만 보여줍니다. `diff` 를 펼치는 것은
 * `admin/audit-logs` 의 표가 이미 합니다 — 같은 화면을 두 번 만들지 않습니다.
 */

export interface HistoryEntry {
  id: string;
  /**
   * 사람이 읽는 행위 이름.
   *
   * **`features/audit` 의 표를 여기서 import 하지 않습니다** —
   * `features/A → features/B` 는 `check-deps` 가 막습니다(실제로 막혔습니다).
   * 조립은 app 계층이 하고, 여기는 받은 문자열을 그립니다.
   */
  actionLabel: string;
  summary: string;
  actorUsername: string;
  via: "WEB" | "MCP";
  createdAt: string;
}

export function ResourceHistory({
  entries,
  canSeeAll,
}: {
  entries: HistoryEntry[];
  /** `ADMIN` 인가 — 전체 감사 로그로 가는 링크를 줄지 정한다 */
  canSeeAll: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">변경 이력</CardTitle>
        <CardDescription>
          이 자료에 일어난 일입니다.
          {canSeeAll && (
            <>
              {" "}
              전체는{" "}
              <Link
                className="underline underline-offset-4"
                href="/admin/audit-logs"
              >
                감사 로그
              </Link>
              에 있습니다.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          /*
           * **여기가 「0건」이 되는 일은 사실상 없습니다** — 등록 자체가
           * `RESOURCE_CREATE` 를 남기므로. 비어 있다면 감사 로그 보존
           * 기간(1년)을 지난 오래된 자료입니다.
           */
          <p className="text-muted-foreground text-sm">
            기록이 없습니다. 보존 기간(1년)이 지난 자료일 수 있습니다.
          </p>
        ) : (
          <ul className="divide-y text-sm">
            {entries.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="text-muted-foreground w-32 shrink-0 text-xs tabular-nums">
                  {e.createdAt.slice(0, 16).replace("T", " ")}
                </span>
                <Badge variant="secondary">{e.actionLabel}</Badge>
                <span className="text-muted-foreground font-mono text-xs">
                  @{e.actorUsername}
                </span>
                {/* 웹으로 고친 것과 에이전트가 고친 것을 구별한다 (`DEC-029`) */}
                {e.via === "MCP" && (
                  <span className="text-muted-foreground font-mono text-[10px]">
                    CLI
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
