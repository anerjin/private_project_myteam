"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TASK_STATUS, TASK_TITLE_MAX } from "@/features/projects/schema";
import type { Task } from "@/server/services/project-task.service";
import {
  createTaskAction,
  updateTaskAction,
} from "@/server/actions/project.actions";

/** 「없음」을 값으로 표현합니다 — Radix Select 는 빈 문자열 값을 못 씁니다 */
const NONE = "__none__";

/**
 * 할 일 만들기·고치기 (`FR-PROJ-011`·`013`·`015`·`017`).
 *
 * **날짜를 «적는» 길이 여기 있습니다.** 간트에서 막대를 끄는 것은 편의이고,
 * 정본은 이 폼입니다 (`DEC-070`) — 마우스를 못 쓰는 사람에게도 일정 변경이
 * 되어야 합니다 (`NFR-A11Y-002`).
 */
export function TaskForm({
  open,
  onOpenChange,
  projectId,
  projectSlug,
  task,
  parents,
  members,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  projectSlug: string;
  /** 없으면 «만들기» */
  task?: Task;
  /** 상위로 고를 수 있는 할 일들 — 자기 자신과 자손은 빠져 있어야 합니다 */
  parents: Task[];
  members: { id: string; name: string }[];
  onDone?: () => void;
}) {
  const editing = Boolean(task);
  const [title, setTitle] = useState(task?.title ?? "");
  const [startsOn, setStartsOn] = useState(task?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(task?.endsOn ?? "");
  const [isMilestone, setIsMilestone] = useState(task?.isMilestone ?? false);
  const [progress, setProgress] = useState(String(task?.progress ?? 0));
  const [status, setStatus] = useState(task?.status ?? "TODO");
  const [assigneeId, setAssigneeId] = useState(task?.assignee?.id ?? NONE);
  const [parentId, setParentId] = useState(task?.parentId ?? NONE);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);

  async function submit() {
    if (pending) return;
    setPending(true);
    setErrors({});
    const input = {
      title,
      startsOn,
      // 마일스톤은 한 점 — 종료일 칸을 숨기고 시작일로 맞춥니다
      endsOn: isMilestone ? startsOn : endsOn,
      isMilestone,
      progress,
      status,
      assigneeId: assigneeId === NONE ? "" : assigneeId,
      parentId: parentId === NONE ? "" : parentId,
    };
    const r = editing
      ? await updateTaskAction(projectId, task!.id, projectSlug, input)
      : await createTaskAction(projectId, projectSlug, input);
    setPending(false);

    if (!r.ok) {
      if (r.fieldErrors) setErrors(r.fieldErrors);
      else toast.error(r.message ?? "저장하지 못했습니다.");
      return;
    }
    toast.success(editing ? "고쳤습니다." : "만들었습니다.");
    onOpenChange(false);
    onDone?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "할 일 고치기" : "새 할 일"}</DialogTitle>
          <DialogDescription>
            날짜는 여기서 정합니다. 간트에서 막대를 끌어도 같은 값이 바뀝니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">할 일</Label>
            <Input
              id="task-title"
              value={title}
              maxLength={TASK_TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
            />
            {errors.title?.[0] && (
              <p className="text-destructive text-sm">{errors.title[0]}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="task-milestone"
              checked={isMilestone}
              onCheckedChange={(v) => setIsMilestone(v === true)}
            />
            <Label htmlFor="task-milestone" className="font-normal">
              마일스톤 (기간 없는 한 점)
            </Label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="task-start">
                {isMilestone ? "날짜" : "시작일"}
              </Label>
              <Input
                id="task-start"
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
              />
            </div>
            {!isMilestone && (
              <div className="space-y-1.5">
                <Label htmlFor="task-end">종료일</Label>
                <Input
                  id="task-end"
                  type="date"
                  value={endsOn}
                  onChange={(e) => setEndsOn(e.target.value)}
                />
                {errors.endsOn?.[0] && (
                  <p className="text-destructive text-sm">{errors.endsOn[0]}</p>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="task-status">상태</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="task-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-progress">진행률 (%)</Label>
              <Input
                id="task-progress"
                type="number"
                min={0}
                max={100}
                value={progress}
                onChange={(e) => setProgress(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="task-assignee">담당자</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger id="task-assignee" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>없음</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-parent">상위 할 일</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger id="task-parent" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>없음</SelectItem>
                  {parents.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {"— ".repeat(p.depth)}
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            disabled={pending || !title.trim()}
            onClick={() => void submit()}
          >
            {pending ? "저장 중…" : editing ? "저장" : "만들기"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
