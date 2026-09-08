"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  isReasonLongEnough,
  REASON_MIN_LENGTH,
} from "@/features/members/schema";

/**
 * 사유 입력이 필요한 처리 — 정지·강제 탈퇴 (`REQ-02 · 2.4`, `FR-ADM-005`·`FR-ADM-008`).
 *
 * 「거부」가 셋째였습니다. 가입 신청이 사라지면서 함께 없어졌습니다 (`DEC-077`).
 *
 *
 * ## 목록과 상세가 **같은 다이얼로그**를 씁니다
 *
 * 전에는 `member-table.tsx` 안에 있었습니다. 상세 화면에도 처리 버튼이
 * 생기면서 복사할 뻔했는데, 그러면 **최소 길이 규칙이 두 벌**이 됩니다 —
 * 이 프로젝트가 이미 겪은 형태입니다(액션은 `min(2)`, 다이얼로그는 `< 2`,
 * 규격은 10자였습니다).
 *
 * ## `hint` 가 **어디까지 가는지** 말합니다
 *
 * 사유가 본인에게 전달되는지는 처리마다 다릅니다(`DEC-041`). 스키마는
 * **길이만** 알고, 전달 여부는 부르는 쪽이 이 칸으로 말합니다 — 그 구분이
 * 없었을 때 한 화면 안의 두 문장이 서로를 부정했습니다.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  target,
  title,
  hint,
  confirmLabel = "확인",
  destructive = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 누구에게 하는 처리인지 — 화면에 그대로 보여 준다 */
  target: string;
  title: string;
  /** 이 사유가 **어디까지 가는지** 관리자에게 정확히 말한다 (`DEC-041`) */
  hint: string;
  confirmLabel?: string;
  /** 되돌릴 수 없는 처리인가 */
  destructive?: boolean;
  onConfirm: (reason: string) => Promise<void> | void;
}) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  function close(next: boolean) {
    if (!next) setReason("");
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{hint}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-sm">
            대상: <span className="font-medium">{target}</span>
          </p>
          <Label htmlFor="reason">사유</Label>
          <Textarea
            id="reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            {reason.trim().length} / {REASON_MIN_LENGTH}자 이상
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            취소
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={!isReasonLongEnough(reason) || pending}
            onClick={async () => {
              setPending(true);
              await onConfirm(reason.trim());
              setPending(false);
              setReason("");
            }}
          >
            {pending ? "처리 중…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
