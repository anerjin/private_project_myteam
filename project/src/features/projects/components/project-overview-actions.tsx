"use client";

import { Pencil, Trash2 } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ProjectForm } from "@/features/projects/components/project-form";
import type { ProjectSummary } from "@/server/services/project.service";
import { deleteProjectAction } from "@/server/actions/project.actions";

/**
 * 프로젝트 고치기·삭제 (`FR-PROJ-004`).
 *
 * **개요 맨 아래에 둡니다.** 머리에 두면 문서를 보러 온 사람의 손이 삭제
 * 단추 옆을 지나갑니다.
 *
 * 삭제는 **확인을 받습니다.** 되돌릴 수 있어도(휴지통) 그동안 팀 전원이
 * 못 봅니다 — 지우는 사람만 아는 실수가 됩니다.
 */
export function ProjectOverviewActions({
  project,
  canDelete,
}: {
  project: ProjectSummary;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function remove() {
    const r = await deleteProjectAction(project.id);
    if (!r.ok) {
      toast.error(r.message ?? "옮기지 못했습니다.");
      return;
    }
    toast.success("휴지통으로 옮겼습니다.");
    router.push("/projects");
  }

  return (
    <div className="flex items-center justify-between border-t pt-4">
      <p className="text-muted-foreground text-xs">
        만든 사람 {project.owner.name} · 마지막 수정{" "}
        {project.updatedAt.slice(0, 10)}
      </p>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="size-4" />
          고치기
        </Button>
        {canDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="size-4" />
            휴지통으로
          </Button>
        )}
      </div>

      <ProjectForm
        open={editing}
        onOpenChange={setEditing}
        project={project}
        onDone={() => router.refresh()}
      />

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              「{project.name}」을 휴지통으로 옮깁니까?
            </AlertDialogTitle>
            <AlertDialogDescription>
              문서 {project.docCount}건과 할 일 {project.taskCount}건이 함께
              목록에서 사라집니다. 휴지통에서 되살릴 수 있지만, 그동안 팀
              전원이 볼 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>
              휴지통으로
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
