"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  SETTING_META,
  type SettingKey,
} from "@/features/admin/settings.schema";
import { updateSettingAction } from "@/server/actions/taxonomy.actions";

/**
 * SCR-261 시스템 설정 (`FR-ADM-015`).
 *
 * ## 스위치가 이제 **실제로 무언가를 합니다**
 *
 * 여기 있던 것은 전부 `disabled` 였습니다 — 그게 그때는 정직했습니다
 * (`P8` 전까지 저장 경로가 없었으므로). 이제 값이 `system_settings` 에
 * 저장되고 **읽는 쪽이 그 값을 봅니다**: 업로드 상한은 `file.service`,
 * 아카이브 상한과 디스크 임계치는 아카이브 작업과 관리자 대시보드가
 * `settings.service` 를 지납니다.
 *
 * ## 「기본값입니다」를 말합니다
 *
 * 한 번도 안 건드린 값은 `.env` 에서 옵니다. 그 사실을 안 보여주면
 * 관리자는 **누가 이 값을 정했는지** 알 수 없습니다.
 *
 * ## 숫자는 **바꾼 뒤 저장**입니다
 *
 * 스위치는 누르는 순간이 곧 의도지만, 숫자는 타이핑 중간값이 저장되면
 * 안 됩니다 (`5` 를 `50` 으로 고치는 도중에 `5` 가 저장됩니다).
 */

export interface SettingRow {
  key: SettingKey;
  value: boolean | number;
  overridden: boolean;
  updatedAt: string | null;
}

export function SystemSettings({ settings }: { settings: SettingRow[] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  function save(key: SettingKey, value: boolean | number, done: string) {
    startTransition(async () => {
      const r = await updateSettingAction({ key, value });
      if (!r.ok) {
        toast.error(r.message ?? "저장하지 못했습니다.");
        return;
      }
      toast.success(done);
      setDrafts((d) => {
        const next = { ...d };
        delete next[key];
        return next;
      });
      router.refresh();
    });
  }

  return (
    <div className="divide-y rounded-lg border">
      {settings.map((s) => {
        const meta = SETTING_META[s.key];
        const draft = drafts[s.key];
        const changed =
          draft !== undefined && draft !== "" && Number(draft) !== s.value;

        return (
          <div
            key={s.key}
            className="flex flex-wrap items-center gap-4 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{meta.label}</p>
              <p className="text-muted-foreground text-xs">
                {meta.description}
              </p>
              {/* 「누가 이 값을 정했는가」 — 안 보여주면 답이 없습니다 */}
              <p className="text-muted-foreground mt-1 text-xs">
                {s.overridden
                  ? `이 화면에서 정한 값${s.updatedAt ? ` · ${s.updatedAt.slice(0, 10)}` : ""}`
                  : "환경변수의 기본값"}
              </p>
            </div>

            {typeof s.value === "boolean" ? (
              <Switch
                aria-label={meta.label}
                checked={s.value}
                disabled={busy}
                onCheckedChange={(v) =>
                  save(s.key, v, `${meta.label}을(를) ${v ? "켰" : "껐"}습니다.`)
                }
              />
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  aria-label={meta.label}
                  type="number"
                  inputMode="numeric"
                  className="w-28"
                  value={draft ?? String(s.value)}
                  disabled={busy}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [s.key]: e.target.value }))
                  }
                />
                <span className="text-muted-foreground text-xs">
                  {meta.unit}
                </span>
                <Button
                  size="sm"
                  disabled={busy || !changed}
                  onClick={() =>
                    save(
                      s.key,
                      Number(draft),
                      `${meta.label}을(를) ${draft}${meta.unit ?? ""} 로 바꿨습니다.`
                    )
                  }
                >
                  저장
                </Button>
                {changed && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label="되돌리기"
                    onClick={() =>
                      setDrafts((d) => {
                        const next = { ...d };
                        delete next[s.key];
                        return next;
                      })
                    }
                  >
                    <RotateCcw className="size-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
