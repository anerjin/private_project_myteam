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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { getContentType } from "@/features/resources/content-types";
import { deleteResourceAction } from "@/server/actions/resource.actions";
import type { Resource } from "@/types";

/**
 * 자료 삭제 — 소프트 삭제(휴지통)입니다 (`FR-RES-007`).
 *
 * > 되살리기와 영구 삭제는 `P8`(관리자 전체) 몫입니다. **여기에 그 요구사항
 * > 번호를 적지 않습니다** — `check-fr-coverage` 는 번호가 코드에 있으면
 * > 「만들었다」로 세므로, 「아직 안 만들었다」고 «설명하는» 주석이 그 번호를
 * > 달면 게이트가 그 말을 못 알아듣고 통과시킵니다. 안 만든 것의 번호는
 * > 그 스크립트의 `DEBT` 목록에만 적습니다.
 *
 * > **전에는 액션을 부르지 않고 토스트만 띄웠습니다.** 「삭제했습니다 · 30일간
 * > 복구할 수 있습니다」가 뜨고 목록으로 튕기는데 **자료는 그대로 있었습니다.**
 * > 이 저장소가 반복해서 지킨 「있는데 안 된다」보다 「아직 없다」가 정직하다를
 * > 여기서만 어겼고, 심지어 「없다」가 아니라 **거짓말**이었습니다.
 * >
 * > 「실행 취소」도 `toast.info` 뿐이었습니다 — **복구 액션이 없으므로 문구에서 뺐습니다.**
 * > 복구는 `P8`(관리자 전체)의 휴지통에서 합니다.
 */
export function DeleteResourceDialog({ resource }: { resource: Resource }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const r = await deleteResourceAction(resource.id);
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      setOpen(false);
      toast.success("삭제했습니다.", {
        description: "휴지통으로 옮겼습니다. 복구는 관리자에게 문의해 주세요.",
      });
      router.push(`/resources/${getContentType(resource.type).slug}`);
      router.refresh();
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive">
          <Trash2 className="size-4" />
          삭제
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>이 자료를 삭제할까요?</AlertDialogTitle>
          <AlertDialogDescription>
            «{resource.title}» 을(를) 휴지통으로 옮깁니다.
            <br />
            목록·검색에서 사라지고, 되돌리려면 관리자가 복구해야 합니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>취소</AlertDialogCancel>
          {/*
            `onSelect` 로 기본 닫힘을 막습니다 — 액션이 실패했는데 다이얼로그가
            닫히면 사용자는 「지워졌나?」를 모릅니다.
          */}
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              remove();
            }}
          >
            {pending ? "삭제 중…" : "삭제"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/*
 * **`PurgeResourceDialog` 를 지웠습니다.**
 *
 * 호출자가 0이었고 `onClick` 이 `toast.success("영구 삭제했습니다.")` 뿐이었습니다 —
 * 위와 같은 거짓말이 하나 더 있었던 셈입니다. 영구 삭제는
 * `P8`(관리자 전체) 몫이며, 그때 **액션과 함께** 만드는 편이 낫습니다.
 * 지금 껍데기를 남겨 두면 다음 사람이 「있으니 배선만 하면 되겠네」로 읽습니다.
 */
