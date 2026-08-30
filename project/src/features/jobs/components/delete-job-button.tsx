"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { deleteJobAction } from "@/server/actions/job.actions";

/**
 * 작업 기록 한 줄 삭제 (`SCR-241`).
 *
 * ## 확인을 묻지 않습니다
 *
 * 지워지는 것은 **자료가 아니라 실행 기록**입니다. 잘못 눌러도 잃는 것은
 * 「언제 한 번 돌았다」 한 줄이고, 자료·파일은 그대로입니다.
 * `trash-actions` 가 영구 삭제에만 확인을 붙인 것과 같은 기준입니다 —
 * **모든 것에 확인을 붙이면 확인이 의미를 잃습니다.**
 *
 * ## 끝난 것에만 나타납니다
 *
 * 판정은 `job.service.isDeletable` 이 합니다. 화면이 `status === "DONE"` 을
 * 손으로 적으면 상태가 늘어난 날 한쪽만 고쳐집니다 — `isRetryable` 을
 * 서비스로 올린 것과 같은 자리입니다.
 */
export function DeleteJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="icon"
      variant="ghost"
      aria-label="작업 기록 삭제"
      className="text-muted-foreground hover:text-destructive"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await deleteJobAction(jobId);
          if (!r.ok) {
            toast.error(r.message ?? "지우지 못했습니다.");
            return;
          }
          toast.success("기록을 지웠습니다.");
          router.refresh();
        })
      }
    >
      <Trash2 className="size-3.5" />
    </Button>
  );
}
