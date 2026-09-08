"use client";

import { RotateCcw, Trash2 } from "lucide-react";
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
import {
  purgeResourceAction,
  restoreResourceAction,
} from "@/server/actions/resource.actions";

/**
 * 휴지통 행의 처리 — 복구 · 영구 삭제 (`FR-ADM-011`, `FR-RES-008`·`009`).
 *
 * ## 복구는 확인을 묻지 않습니다
 *
 * 되돌리는 동작이라 잘못 눌러도 다시 지우면 그만입니다. **모든 것에 확인을
 * 붙이면 확인이 의미를 잃습니다** — 관리자는 읽지 않고 누르게 됩니다.
 *
 * ## 영구 삭제는 묻습니다
 *
 * 30일 유예의 존재 이유를 없애는 동작이고 되돌릴 수 없습니다. 무엇이
 * 사라지는지(첨부·아카이브 파일 포함) 문구로 말합니다.
 */
export function TrashActions({
  resource,
}: {
  resource: { id: string; title: string };
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function restore() {
    startTransition(async () => {
      const r = await restoreResourceAction(resource.id);
      if (!r.ok) {
        toast.error(r.message ?? "되살리지 못했습니다.");
        return;
      }
      toast.success(`«${resource.title}» 을(를) 되살렸습니다.`);
      router.refresh();
    });
  }

  function purge() {
    setConfirming(false);
    startTransition(async () => {
      const r = await purgeResourceAction(resource.id);
      if (!r.ok) {
        toast.error(r.message ?? "삭제하지 못했습니다.");
        return;
      }
      toast.success(`«${resource.title}» 을(를) 영구 삭제했습니다.`);
      router.refresh();
    });
  }

  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="ghost" disabled={busy} onClick={restore}>
        <RotateCcw className="size-4" />
        복구
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        disabled={busy}
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="size-4" />
        영구 삭제
      </Button>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>영구 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              «{resource.title}» 과 그에 딸린 첨부 파일·아카이브가 디스크에서
              사라집니다. <b>되돌릴 수 없습니다.</b> 무엇을 지웠는지는 감사
              로그에 남습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={purge}
            >
              영구 삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
