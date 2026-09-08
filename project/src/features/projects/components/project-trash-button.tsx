"use client";

import { Loader2, Trash2 } from "lucide-react";
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
import { deleteProjectAction } from "@/server/actions/project.actions";

/**
 * 상세에서 프로젝트를 **휴지통으로** (`FR-PROJ-004` · `DEC-075`).
 *
 * 🔴 **확인을 받습니다.** 되살릴 수 있어도(휴지통) 그동안 **팀 전원이 못
 *    봅니다** — 지우는 사람만 아는 실수가 됩니다. 목록의 확인 대화와 **같은
 *    문장**을 씁니다: 규칙이 같은데 말이 다르면 어느 쪽이 참인지 알 수 없습니다.
 *
 * 🔴 **누를 수 있는가는 부르는 쪽이 정합니다**(상세 화면의 `canDelete`).
 *    ⚠️ 그 값은 관문이 아닙니다 — 막는 것은 `project.service.assertCanDelete`
 *       이고, 여기서는 못 누를 버튼을 안 그릴 뿐입니다.
 *
 * ⛔ **원본(Orbee)에는 대응이 없습니다.** 그쪽은 목록 카드의 메뉴에서만 지우고
 *    상세에는 삭제가 없습니다 — 즉시·영구 삭제라 그 자리를 좁게 둔 것입니다.
 *    우리는 되살릴 수 있고, 상세까지 들어와서 「이건 아니다」를 아는 흐름이
 *    흔해서 여기에도 둡니다. 지운 뒤에는 볼 것이 없으므로 목록으로 나갑니다.
 */
export function ProjectTrashButton({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    const r = await deleteProjectAction(projectId);
    setBusy(false);
    if (!r.ok) {
      toast.error(r.message ?? "휴지통으로 옮기지 못했습니다.");
      return;
    }
    setOpen(false);
    toast.success("휴지통으로 옮겼습니다.");
    /* 🔴 **`refresh` 가 아니라 `push` 입니다.** 이 화면은 지워진 프로젝트를 더
       못 엽니다(`getBySlug` 가 `deletedAt: null` 로 좁힙니다) — 여기 남으면
       다시 그리는 순간 404 입니다. */
    router.push("/projects");
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="font-semibold"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4" /> 휴지통으로
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="truncate">
              「{projectName}」을(를) 휴지통으로 옮길까요?
            </DialogTitle>
            <DialogDescription className="leading-relaxed">
              이 프로젝트와 그 안의 항목이 함께 목록에서 사라집니다. 휴지통에서
              되살릴 수 있지만,{" "}
              <strong className="text-foreground">
                그동안 팀 전원이 볼 수 없습니다.
              </strong>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={() => void remove()}
              disabled={busy}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              휴지통으로
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
