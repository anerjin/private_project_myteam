"use client";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  PROJECT_DESC_MAX,
  PROJECT_NAME_MAX,
  PROJECT_STATUS,
} from "@/features/projects/schema";
import type { ProjectSummary } from "@/server/services/project.service";
import {
  createProjectAction,
  updateProjectAction,
} from "@/server/actions/project.actions";

/**
 * 프로젝트 만들기·고치기 (`FR-PROJ-002`·`004`).
 *
 * **한 폼이 둘을 합니다.** 칸이 같으므로 나누면 한쪽만 고치는 날이 옵니다 —
 * `resource-form` 이 등록·수정을 함께 쓰는 것과 같은 판단입니다.
 *
 * 날짜는 `type="date"` 입니다. 값이 `YYYY-MM-DD` 문자열로 그대로 오고 가서
 * **시간대를 타지 않습니다** (`schema.toDate` 주석).
 */
export function ProjectForm({
  open,
  onOpenChange,
  project,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 없으면 «만들기» */
  project?: ProjectSummary;
  onDone?: () => void;
}) {
  const editing = Boolean(project);
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [status, setStatus] = useState(project?.status ?? "PLANNED");
  const [startsOn, setStartsOn] = useState(project?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(project?.endsOn ?? "");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);

  async function submit() {
    if (pending) return;
    setPending(true);
    setErrors({});
    const input = { name, description, status, startsOn, endsOn };
    const r = editing
      ? await updateProjectAction(project!.id, input)
      : await createProjectAction(input);
    setPending(false);

    if (!r.ok) {
      // 칸에 붙는 오류는 칸 옆에, 나머지는 토스트로 — 어디를 고쳐야 하는지가 다릅니다
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
          <DialogTitle>
            {editing ? "프로젝트 고치기" : "새 프로젝트"}
          </DialogTitle>
          <DialogDescription>
            기획·디자인·개발 문서와 일정을 담습니다. 팀 전원이 봅니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="project-name">이름</Label>
            <Input
              id="project-name"
              value={name}
              maxLength={PROJECT_NAME_MAX}
              placeholder="예: 드론 정사영상 파이프라인"
              onChange={(e) => setName(e.target.value)}
            />
            {errors.name?.[0] && (
              <p className="text-destructive text-sm">{errors.name[0]}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-desc">한 줄 설명</Label>
            <Textarea
              id="project-desc"
              className="min-h-20"
              value={description}
              maxLength={PROJECT_DESC_MAX}
              placeholder="무엇을 하는 프로젝트인지 한두 문장으로"
              onChange={(e) => setDescription(e.target.value)}
            />
            {errors.description?.[0] && (
              <p className="text-destructive text-sm">
                {errors.description[0]}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="project-status">상태</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="project-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-start">시작일</Label>
              <Input
                id="project-start"
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-end">종료일</Label>
              <Input
                id="project-end"
                type="date"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
              />
              {errors.endsOn?.[0] && (
                <p className="text-destructive text-sm">{errors.endsOn[0]}</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button disabled={pending || !name.trim()} onClick={() => void submit()}>
            {pending ? "저장 중…" : editing ? "저장" : "만들기"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
