"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABEL,
  AUDIT_GROUPS,
  groupOf,
} from "@/features/audit/actions";
import {
  auditFilterToQuery,
  hasAnyFilter,
  type AuditFilterInput,
} from "@/features/audit/filter.schema";

/**
 * SCR-251 감사 로그 필터 (`FR-AUDIT-002` — 기간·행위자·행위 유형).
 *
 * ## 주소를 바꿉니다
 *
 * 상태를 들고 있다가 표를 걸러내지 않습니다. **서버 페이징이 붙어 있어서**
 * 클라이언트 필터는 「현재 페이지 안에서만」 걸리고, 그러면
 * 「행위자로 걸렀는데 그 사람 기록이 안 나온다」가 됩니다 — `P4` 의 등록자
 * 필터, `P3` 의 감사 표에서 각각 같은 이유로 내렸던 것입니다.
 *
 * ## 적용하면 **1페이지로 돌아갑니다**
 *
 * 3페이지에서 필터를 걸면 새 결과가 1페이지밖에 없어 **빈 화면**이 뜹니다.
 * 「걸었더니 아무것도 없다」와 구별되지 않습니다.
 *
 * ## 선택지는 **서버가 준 것**입니다
 *
 * 행위자 목록은 `audit_logs` 에서 뽑습니다(탈퇴·익명화된 사람도 남도록).
 * 행위 목록은 `features/audit/actions.ts` 한 벌입니다 — 여기 다시 적으면
 * 새 행위가 **기록은 되는데 필터로는 못 찾는** 상태가 됩니다.
 */

/** `Select` 는 빈 문자열을 값으로 못 씁니다 — 「전체」를 나타낼 표식이 따로 필요합니다 */
const ALL = "__all__";

export function AuditFilters({
  current,
  actors,
}: {
  current: AuditFilterInput;
  /** 실제로 기록을 남긴 적이 있는 아이디 */
  actors: string[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<AuditFilterInput>(current);

  function set<K extends keyof AuditFilterInput>(
    key: K,
    value: AuditFilterInput[K]
  ) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function apply() {
    // 필터가 바뀌면 1페이지로 — page 를 안 싣는 것이 곧 1페이지다
    router.push(`/admin/audit-logs${auditFilterToQuery(draft)}`);
  }

  function clear() {
    setDraft({});
    router.push("/admin/audit-logs");
  }

  return (
    <form
      className="bg-muted/30 grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-5"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="audit-actor" className="text-xs">
          행위자
        </Label>
        <Select
          value={draft.actor ?? ALL}
          onValueChange={(v) => set("actor", v === ALL ? undefined : v)}
        >
          <SelectTrigger id="audit-actor" className="w-full">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>전체</SelectItem>
            {actors.map((a) => (
              <SelectItem key={a} value={a}>
                @{a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="audit-action" className="text-xs">
          행위
        </Label>
        <Select
          value={draft.action ?? ALL}
          onValueChange={(v) =>
            set("action", v === ALL ? undefined : (v as AuditFilterInput["action"]))
          }
        >
          <SelectTrigger id="audit-action" className="w-full">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>전체</SelectItem>
            {/* 스물다섯 개를 한 줄로 늘어놓으면 아무도 못 고릅니다 */}
            {AUDIT_GROUPS.map((g) => {
              const items = AUDIT_ACTIONS.filter((a) => groupOf(a) === g);
              if (items.length === 0) return null;
              return (
                <SelectGroup key={g}>
                  <SelectLabel>{g}</SelectLabel>
                  {items.map((a) => (
                    <SelectItem key={a} value={a}>
                      {AUDIT_ACTION_LABEL[a]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="audit-via" className="text-xs">
          경로
        </Label>
        <Select
          value={draft.via ?? ALL}
          onValueChange={(v) =>
            set("via", v === ALL ? undefined : (v as "WEB" | "MCP"))
          }
        >
          <SelectTrigger id="audit-via" className="w-full">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>전체</SelectItem>
            <SelectItem value="WEB">WEB — 사람이 화면에서</SelectItem>
            <SelectItem value="MCP">MCP — 에이전트가 CLI 로</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="audit-from" className="text-xs">
          시작일
        </Label>
        <Input
          id="audit-from"
          type="date"
          value={draft.from ?? ""}
          onChange={(e) => set("from", e.target.value || undefined)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="audit-to" className="text-xs">
          종료일
        </Label>
        {/* 그날 «끝»까지 포함합니다 — 하루를 넣었을 때 0건이 나오면 안 됩니다 */}
        <Input
          id="audit-to"
          type="date"
          value={draft.to ?? ""}
          onChange={(e) => set("to", e.target.value || undefined)}
        />
      </div>

      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
        <Button type="submit" size="sm">
          <Search className="size-4" />
          적용
        </Button>
        {hasAnyFilter(current) && (
          <Button type="button" size="sm" variant="ghost" onClick={clear}>
            <X className="size-4" />
            전체 해제
          </Button>
        )}
      </div>
    </form>
  );
}
