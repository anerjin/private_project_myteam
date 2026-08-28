"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import type { Resource } from "@/types";
import { getContentType } from "@/features/resources/content-types";

/**
 * 자료 삭제 — 소프트 삭제(휴지통)입니다. (FR-RES-007)
 * 되돌릴 수 있는 작업이므로 `AlertDialog` 로 확인만 받고, 실행 취소를 토스트로 제공합니다.
 */
export function DeleteResourceDialog({ resource }: { resource: Resource }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

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
            휴지통에서 <b>30일간 복구</b>할 수 있고, 이후 정리 대상이 됩니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              toast.success("삭제했습니다.", {
                description: "휴지통에서 30일간 복구할 수 있습니다.",
                action: {
                  label: "실행 취소",
                  onClick: () => toast.info("삭제를 취소했습니다."),
                },
                duration: 5000,
              });
              router.push(`/resources/${getContentType(resource.type).slug}`);
            }}
          >
            삭제
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * 영구 삭제 — 관리자 전용, 되돌릴 수 없습니다. (FR-RES-009)
 * 제목을 직접 입력해야 버튼이 열립니다. (DEV-04 · 4.5절 다이얼로그 규약)
 */
export function PurgeResourceDialog({
  title,
  trigger,
}: {
  title: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const matched = typed.trim() === title.trim();

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setTyped("");
      }}
    >
      <AlertDialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm" className="text-destructive">
            <Trash2 className="size-4" />
            영구 삭제
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>영구 삭제 — 되돌릴 수 없습니다</AlertDialogTitle>
          <AlertDialogDescription>
            자료와 연결된 첨부·아카이브 파일까지 함께 지웁니다.
            <br />
            확인을 위해 아래에 <b>자료 제목</b>을 그대로 입력해 주세요.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <p className="bg-muted rounded px-3 py-2 text-sm">{title}</p>
          <input
            className="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
            placeholder="자료 제목을 입력하세요"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            aria-label="확인용 자료 제목"
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction
            disabled={!matched}
            onClick={() => toast.success("영구 삭제했습니다.")}
          >
            영구 삭제
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
