"use client";

import { CalendarRange, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ProjectSpanFields,
  type ProjectSpanValue,
} from "@/features/projects/components/project-span-fields";
import { spanReversed } from "@/features/projects/project-span";
import { updateProjectSpanAction } from "@/server/actions/project.actions";

/**
 * 프로젝트 **기간**을 고치는 자리 — 상세 머리말의 버튼 하나 (`DEC-075`).
 *
 * 🔴 **칸을 새로 짓지 않습니다.** 그 칸은 목록의 만들기·수정 폼에 이미 있고,
 *    두 화면이 각자 세우면 **한쪽에만 「비울 수 있음」이 붙는 날**이 옵니다 —
 *    그때 *"목록에서는 기간을 지울 수 있는데 상세에서는 못 지운다"* 가 됩니다.
 *    그래서 두 칸을 `ProjectSpanFields` 로 뽑아 **양쪽이 같은 것을 그립니다.**
 *
 * 🔴 **여기가 클라이언트인 이유**: 상세 화면(`project-detail-view.tsx`)은
 *    `"use client"` 가 없는 서버 컴포넌트입니다. 대화 상자는 상태를 갖습니다.
 *
 * ⚠️ **표시는 여기서 안 합니다.** 기간 한 줄은 상세 머리말에 이미 있습니다
 *    (`projectSpan` 의 `label`). 이 컴포넌트는 **고치는 입구**만 냅니다.
 *
 * ## 🔄 누가 누를 수 있는가 — **원본과 정반대입니다**
 *
 * 원본(Orbee)은 이 버튼을 **소유자에게만** 그립니다. 프로젝트의 정체(이름·기간)는
 * 만든 사람의 것이고 참가자(`editor`)가 고치는 것은 그 안의 항목이라는 판단이고,
 * 그쪽 DAL 의 `updateOwned` 가 실제로 막습니다.
 *
 * **우리는 전원이 고칩니다** (`DEC-018`, 운영자 재확인 2026-09-04) — 조회에도
 * 수정에도 소유자 조건이 없고, `ownerId` 는 **지울 권한에만** 씁니다
 * (`project.service` 머리말). 그 규칙을 그대로 두고 이 버튼만 소유자로 좁히면
 * 「목록에서는 고쳐지는데 상세에서는 버튼이 없는」 상태가 됩니다.
 */
export function ProjectSpanDialog({
  projectId,
  projectSlug,
  projectName,
  start,
  end,
}: {
  projectId: string;
  projectSlug: string;
  projectName: string;
  start: string | null;
  end: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        data-slot="edit-project-span"
        variant="outline"
        size="sm"
        className="font-semibold"
        onClick={() => setOpen(true)}
      >
        <CalendarRange className="size-4" /> 기간 수정
      </Button>

      {/* 🔴 **값이 `DialogContent` 안쪽에 삽니다.** Radix Dialog 는 닫히면 아래를
          언마운트하므로(우리 `dialog.tsx` 에 `forceMount` 가 없습니다) 열 때마다
          **지금 저장된 기간**으로 다시 시작합니다. 바깥에 두면 취소한 값이 다음에
          열 때 남습니다 — 간트의 두 폼이 같은 함정을 같은 방식으로 피합니다. */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          {open && (
            <SpanBody
              projectId={projectId}
              projectSlug={projectSlug}
              projectName={projectName}
              initial={{ start: start ?? "", end: end ?? "" }}
              onDone={() => setOpen(false)}
              onCancel={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function SpanBody({
  projectId,
  projectSlug,
  projectName,
  initial,
  onDone,
  onCancel,
}: {
  projectId: string;
  projectSlug: string;
  projectName: string;
  initial: ProjectSpanValue;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [pending, setPending] = useState(false);

  async function submit() {
    if (spanReversed(value.start, value.end)) {
      toast.error("끝이 시작보다 앞섭니다.");
      return;
    }
    setPending(true);
    const r = await updateProjectSpanAction(projectId, projectSlug, {
      startsOn: value.start || null,
      endsOn: value.end || null,
    });
    setPending(false);
    if (!r.ok) {
      /* 🔴 **대화를 안 닫습니다.** 닫으면 방금 고른 날짜가 사라지고, 화면의
         기간은 옛 값인 채라 *"저장됐는데 안 보이는 건가"* 와 구별이 안 됩니다. */
      toast.error(r.message ?? "기간을 고치지 못했습니다.");
      return;
    }
    onDone();
    /* 상세는 서버 컴포넌트입니다 — 액션의 `revalidatePath` 가 비운 캐시를 실제로
       다시 받아 와야 머리말의 기간과 간트의 이동 경계가 함께 바뀝니다. */
    router.refresh();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="truncate">「{projectName}」 기간</DialogTitle>
        <DialogDescription className="leading-relaxed">
          {/* 🔴 **비울 수 있다는 것을 말합니다.** 기간이 없는 프로젝트는 타임라인이
              무한이고(`ganttRangeBounds` 가 아무것도 안 돌려줍니다) 그것이
              «안 정함»의 뜻입니다. */}
          비워 두면 기간을 정하지 않은 프로젝트가 됩니다. 항목은 그대로
          남습니다.
        </DialogDescription>
      </DialogHeader>

      <ProjectSpanFields
        idPrefix="project-span"
        value={value}
        onChange={setValue}
        disabled={pending}
      />

      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          취소
        </Button>
        <Button onClick={() => void submit()} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          저장
        </Button>
      </DialogFooter>
    </>
  );
}
