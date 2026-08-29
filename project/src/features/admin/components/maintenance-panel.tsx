"use client";

import { CalendarClock, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { runMaintenanceAction } from "@/server/actions/taxonomy.actions";

/**
 * SCR-241 스케줄 작업 · 보존 배치 (`REQ-04 · 4.8`, `DEC-020`·`DEC-021`).
 *
 * ## 「지금 실행」이 있는 이유
 *
 * 평소에는 Windows 작업 스케줄러가 `npm run maintenance` 로 부릅니다
 * (`DEC-053` — 별도 워커 프로세스를 두지 않습니다). 그런데 **스케줄러가
 * 도는지 확인할 방법**이 필요하고, 확인하는 가장 확실한 방법은 한 번
 * 눌러 보는 것입니다.
 *
 * ## 마지막 실행 시각을 **작업 기록에서** 읽습니다
 *
 * 별도의 `schedules` 테이블이 없습니다. `jobs` 에 남은 그 유형의 마지막
 * `DONE` 이 곧 마지막 실행이고, 그래야 「돌았다고 적혀 있는데 작업 기록은
 * 없는」 상태가 안 생깁니다.
 */

export interface ScheduleRow {
  type: string;
  label: string;
  every: string;
  lastRunAt: string | null;
  due: boolean;
}

export function MaintenancePanel({
  schedules,
  retention,
}: {
  schedules: ScheduleRow[];
  retention: {
    keysExpiringSoon: number;
    githubTokenMissing: boolean;
  };
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [last, setLast] = useState<string | null>(null);

  const dueCount = schedules.filter((s) => s.due).length;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="size-4" />
            스케줄 작업
          </CardTitle>
          <CardDescription>
            평소에는 Windows 작업 스케줄러가 하루 한 번 <code>npm run
            maintenance</code> 로 부릅니다. 여기 버튼은 같은 함수를 지납니다.
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant={dueCount > 0 ? "default" : "outline"}
          disabled={busy}
          onClick={() =>
            startTransition(async () => {
              const r = await runMaintenanceAction();
              if (!r.ok) {
                toast.error(r.message ?? "실행하지 못했습니다.");
                return;
              }
              const d = r.data;
              /*
               * **무엇을 했는지 말합니다.** 「실행했습니다」만 띄우면 아무 일도
               * 안 일어난 실행과 구별되지 않습니다.
               */
              const parts = [
                d.queued.length > 0 ? `작업 ${d.queued.length}건 시작` : null,
                d.retention.anonymized > 0
                  ? `익명화 ${d.retention.anonymized}건`
                  : null,
                d.retention.auditLogsRemoved > 0
                  ? `감사 로그 ${d.retention.auditLogsRemoved}건 정리`
                  : null,
              ].filter(Boolean);
              setLast(new Date().toISOString().slice(0, 16).replace("T", " "));
              toast.success(
                parts.length > 0
                  ? parts.join(" · ")
                  : "밀린 작업이 없습니다. 전부 최신입니다."
              );
              router.refresh();
            })
          }
        >
          <Play className="size-4" />
          {busy ? "실행 중…" : dueCount > 0 ? `지금 실행 (${dueCount})` : "지금 실행"}
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        <ul className="divide-y text-sm">
          {schedules.map((s) => (
            <li key={s.type} className="flex flex-wrap items-center gap-3 py-2">
              <span className="font-medium">{s.label}</span>
              <code className="text-muted-foreground text-xs">{s.every}</code>
              <span className="text-muted-foreground ml-auto text-xs">
                {s.lastRunAt
                  ? `마지막 ${s.lastRunAt.slice(0, 16).replace("T", " ")}`
                  : "아직 안 돎"}
              </span>
              {s.due && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  밀림
                </span>
              )}
            </li>
          ))}
        </ul>

        {/*
          **보존 배치는 「밀림」이 없습니다** — 조건에 맞는 것이 없으면 0건이고
          그건 정상입니다. 대신 사람이 손써야 하는 것만 경고로 올립니다.
        */}
        {retention.keysExpiringSoon > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-500">
            API 키 {retention.keysExpiringSoon}개가 30일 안에 만료됩니다. 소유자에게
            알려 주세요 — 만료되면 CLI 수집이 조용히 멈춥니다.
          </p>
        )}
        {retention.githubTokenMissing && (
          <p className="text-muted-foreground text-xs">
            <code>GITHUB_TOKEN</code> 이 없어 API 한도가 시간당 60회입니다. 저장소
            메타 갱신이 저장소 수를 다 돌지 못할 수 있습니다.
          </p>
        )}

        {last && (
          <p className="text-muted-foreground text-xs">
            이 화면에서 마지막으로 실행: {last}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
