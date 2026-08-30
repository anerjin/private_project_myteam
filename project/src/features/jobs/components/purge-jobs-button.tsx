"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
import { purgeJobsAction } from "@/server/actions/job.actions";

/**
 * 끝난 작업 기록 일괄 정리 (`SCR-241`).
 *
 * ## 건수를 «미리» 말합니다
 *
 * 「정리」라고만 쓰인 버튼은 몇 건이 사라질지 모른 채 누르게 됩니다.
 * 서버가 센 값을 버튼과 확인 문구에 함께 싣습니다 — 0건이면 아예 뜨지 않습니다.
 *
 * ## 대기·실행 중은 남습니다
 *
 * 조건은 서버의 `where` 에 있습니다(`job.service.purgeFinished`). 문구가
 * 「끝난 것만」이라고 말하려면 실제로 그래야 하고, 그 판정을 화면에 다시
 * 적으면 두 곳이 갈립니다.
 */
export function PurgeJobsButton({ count }: { count: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (count === 0) return null;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-3.5" />
        끝난 기록 정리 ({count})
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>끝난 기록 {count}건을 지울까요?</AlertDialogTitle>
            <AlertDialogDescription>
              완료·실패한 작업 기록만 지웁니다. <b>대기·실행 중인 작업은 그대로</b>
              두므로 예정된 일이 사라지지 않습니다. 자료와 파일은 건드리지
              않습니다. 몇 건을 정리했는지는 감사 로그에 남습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                setOpen(false);
                startTransition(async () => {
                  const r = await purgeJobsAction();
                  if (!r.ok) {
                    toast.error(r.message ?? "정리하지 못했습니다.");
                    return;
                  }
                  toast.success(`기록 ${r.data.n}건을 정리했습니다.`);
                  router.refresh();
                });
              }}
            >
              정리
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
