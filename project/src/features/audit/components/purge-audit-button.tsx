"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  countAuditBeforeAction,
  purgeAuditLogsAction,
} from "@/server/actions/audit.actions";

/**
 * 감사 로그 정리 (`SCR-251`).
 *
 * ## 조건은 «시점» 하나입니다
 *
 * 「이 사람의 기록만」·「이 행위만」을 고르게 하지 않습니다. 그건 은폐에 딱
 * 맞는 도구이고, 감사 로그가 있는 이유를 정면으로 거스릅니다.
 * 시점은 보존 정책(`DEC-021` — 1년)과 같은 축이라 「왜 지웠는가」에 답합니다.
 *
 * ## 누르기 «전»에 건수를 셉니다
 *
 * 지운 뒤에 「몇 건이었나」를 묻는 것은 늦습니다. 기간을 고르면 서버가 세어
 * 주고, 0건이면 실행 버튼이 잠깁니다 — 「눌렀는데 아무 일도 없었다」를
 * 남기지 않습니다.
 *
 * ## 지운 사실은 남습니다
 *
 * 삭제와 기록이 한 트랜잭션입니다(`audit.purgeBefore`). 이 화면에서 지워도
 * 「누가 · 언제 · 몇 건 · 어느 시점 이전」 한 줄이 감사 로그에 새로 생깁니다.
 */

const RANGES = [
  { days: 365, label: "1년 이전 (보존 정책 기준)" },
  { days: 180, label: "6개월 이전" },
  { days: 90, label: "90일 이전" },
  { days: 30, label: "30일 이전" },
  { days: 0, label: "전부 — 지금까지 쌓인 기록 모두" },
] as const;

export function PurgeAuditButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<number>(365);
  const [count, setCount] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  /*
   * 기간을 고를 때마다 «몇 건인지» 다시 셉니다.
   *
   * **`setCount(null)`(세는 중) 은 여기가 아니라 이벤트 핸들러에 있습니다.**
   * 이펙트 본문에서 곧바로 `setState` 를 부르면
   * `react-hooks/set-state-in-effect` 가 잡습니다 — 렌더 직후 한 번 더
   * 렌더하게 만드는 형태라 그렇습니다. `tag-input` 이 같은 규칙에 걸렸던
   * 자리이고, 상태 변경은 원래 «무엇 때문에 바뀌는가»가 있는 곳에 두는 것이
   * 맞습니다.
   */
  useEffect(() => {
    if (!open) return;
    let alive = true;
    countAuditBeforeAction(days).then((r) => {
      if (alive) setCount(r.ok ? r.data.n : 0);
    });
    return () => {
      alive = false;
    };
  }, [open, days]);

  const nothingToDo = count === 0;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setCount(null);
          setOpen(true);
        }}
      >
        <Trash2 className="size-3.5" />
        기록 정리
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>감사 로그를 정리합니다</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  고른 시점 <b>이전</b>의 기록을 지웁니다. 되돌릴 수 없습니다.
                </p>

                <div className="space-y-2">
                  <Label htmlFor="purge-range">지울 범위</Label>
                  <Select
                    value={String(days)}
                    onValueChange={(v) => {
                      setCount(null); // 「세는 중」으로 되돌린다
                      setDays(Number(v));
                    }}
                  >
                    <SelectTrigger id="purge-range" aria-label="지울 범위">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RANGES.map((r) => (
                        <SelectItem key={r.days} value={String(r.days)}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <p className="text-foreground text-sm">
                  {count === null ? (
                    "세는 중…"
                  ) : nothingToDo ? (
                    "이 범위에는 지울 기록이 없습니다."
                  ) : (
                    <>
                      <b className="tabular-nums">{count.toLocaleString()}건</b>이
                      사라집니다.
                    </>
                  )}
                </p>

                <p className="text-muted-foreground text-xs">
                  «누가 · 언제 · 몇 건 · 어느 시점 이전»을 지웠는지는 감사
                  로그에 새 줄로 남습니다. 특정 사람이나 특정 행위만 골라 지우는
                  기능은 두지 않았습니다 — 그건 추적을 지우는 일입니다.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending || count === null || nothingToDo}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                // 0건이면 닫히지 않게 — 「눌렀는데 아무 일도 없었다」를 만들지 않는다
                if (count === null || nothingToDo) {
                  e.preventDefault();
                  return;
                }
                setOpen(false);
                startTransition(async () => {
                  const r = await purgeAuditLogsAction(days);
                  if (!r.ok) {
                    toast.error(r.message ?? "정리하지 못했습니다.");
                    return;
                  }
                  toast.success(`감사 로그 ${r.data.n}건을 정리했습니다.`, {
                    description: "정리한 사실은 새 기록으로 남았습니다.",
                  });
                  router.refresh();
                });
              }}
            >
              지우기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
