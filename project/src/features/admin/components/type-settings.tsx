"use client";

import { ChevronDown, ChevronUp, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TypeChip } from "@/components/common/type-chip";
import { updateTypeSettingsAction } from "@/server/actions/taxonomy.actions";
import type { ResourceType } from "@/types";

/**
 * SCR-231 콘텐츠 타입 설정 (`FR-ADM-014`).
 *
 * ## 여기서 바꾸는 것은 **운영 설정 셋**입니다
 *
 * 활성 여부 · 사이드바 노출 · 정렬 순서. 라벨·아이콘·설명은 **코드**에
 * 있습니다 (`DEC-032`·`DEC-058`) — 폼·카드·상세 렌더러와 함께 움직여야
 * 타입 하나가 한 덩어리로 유지되기 때문입니다.
 *
 * ## 저장 버튼이 있습니다
 *
 * 스위치를 누를 때마다 저장하면 순서 변경과 섞여 **여섯 번의 쓰기**가 나고,
 * 중간에 실패하면 화면과 DB 가 반쯤 어긋납니다. 한 번에 목록 전체를 보냅니다.
 *
 * ## 비활성이면 사이드바 스위치를 **끕니다**
 *
 * 「비활성인데 메뉴에는 있다」는 조합은 만들 수 없습니다. 서버도 같은 것을
 * 다시 보지만(액션으로는 만들 수 있으므로), 화면에서 미리 잠가야
 * 관리자가 그 조합을 시도하지 않습니다.
 */

export interface TypeSettingRow {
  code: ResourceType;
  label: string;
  /** 레지스트리의 색 — 서버가 꺼내서 넘깁니다 (`DEC-032`) */
  badgeClass: string;
  description: string;
  isActive: boolean;
  showInNav: boolean;
  count: number;
}

export function TypeSettings({ types }: { types: TypeSettingRow[] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [rows, setRows] = useState(types);

  const dirty =
    JSON.stringify(rows.map((r) => [r.code, r.isActive, r.showInNav])) !==
    JSON.stringify(types.map((r) => [r.code, r.isActive, r.showInNav]));

  function move(index: number, delta: number) {
    const next = [...rows];
    const a = next[index];
    const b = next[index + delta];
    if (!a || !b) return;
    next[index] = b;
    next[index + delta] = a;
    setRows(next);
  }

  function patch(code: ResourceType, change: Partial<TypeSettingRow>) {
    setRows((rs) =>
      rs.map((r) => (r.code === code ? { ...r, ...change } : r))
    );
  }

  function save() {
    startTransition(async () => {
      const r = await updateTypeSettingsAction(
        rows.map(({ code, isActive, showInNav }) => ({
          code,
          isActive,
          showInNav,
        }))
      );
      if (!r.ok) {
        toast.error(r.message ?? "저장하지 못했습니다.");
        return;
      }
      toast.success("콘텐츠 타입 설정을 저장했습니다.");
      router.refresh();
    });
  }

  const orderChanged =
    JSON.stringify(rows.map((r) => r.code)) !==
    JSON.stringify(types.map((r) => r.code));

  return (
    <div className="space-y-4">
      <div className="divide-y rounded-lg border">
        {rows.map((t, i) => (
          <div key={t.code} className="flex flex-wrap items-center gap-4 p-3">
            <div className="flex gap-0.5">
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label="위로"
                disabled={busy || i === 0}
                onClick={() => move(i, -1)}
              >
                <ChevronUp className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label="아래로"
                disabled={busy || i === rows.length - 1}
                onClick={() => move(i, 1)}
              >
                <ChevronDown className="size-4" />
              </Button>
            </div>

            <TypeChip label={t.label} className={t.badgeClass} />

            <div className="min-w-0 flex-1">
              <p className="text-sm">{t.description}</p>
              <code className="text-muted-foreground text-xs">{t.code}</code>
            </div>

            <span className="text-muted-foreground text-xs tabular-nums">
              {t.count}건
            </span>

            <label className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">활성</span>
              <Switch
                checked={t.isActive}
                disabled={busy}
                onCheckedChange={(v) =>
                  // 끄면 사이드바도 함께 내립니다 — 모순된 조합을 못 만들게
                  patch(t.code, { isActive: v, showInNav: v && t.showInNav })
                }
              />
            </label>

            <label className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">사이드바</span>
              <Switch
                checked={t.showInNav}
                disabled={busy || !t.isActive}
                onCheckedChange={(v) => patch(t.code, { showInNav: v })}
              />
            </label>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button disabled={busy || (!dirty && !orderChanged)} onClick={save}>
          <Save className="size-4" />
          저장
        </Button>
        {(dirty || orderChanged) && (
          <span className="text-muted-foreground text-xs">
            저장하지 않은 변경이 있습니다.
          </span>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        비활성으로 바꿔도 기존 자료는 지워지지 않습니다. 목록·검색·등록 폼에서만
        숨습니다. 라벨·아이콘·필드 구조는 코드에 있습니다.
      </p>
    </div>
  );
}
