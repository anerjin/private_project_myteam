"use client";

import { Diamond, Pencil, Plus, Table2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TaskForm } from "@/features/projects/components/task-form";
import { ProjectGantt } from "@/features/projects/components/project-gantt";
import { taskStatusLabel } from "@/features/projects/schema";
import { cn } from "@/lib/utils";
import type { Task, TaskLink } from "@/server/services/project-task.service";
import { deleteTaskAction } from "@/server/actions/project.actions";

/**
 * 할 일 표 + 간트 (`FR-PROJ-010`~`017`).
 *
 * **표가 기본입니다.** 간트는 「언제」를 보는 화면이고, 「무엇을·누가」는
 * 표가 더 잘 보여 줍니다. 그리고 표는 마우스 없이도 전부 됩니다 —
 * 간트만 두면 그 사실이 사라집니다 (`NFR-A11Y-002`).
 */
export function TasksBoard({
  projectId,
  projectSlug,
  tasks,
  links,
  members,
}: {
  projectId: string;
  projectSlug: string;
  tasks: Task[];
  links: TaskLink[];
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [view, setView] = useState<"table" | "gantt">("table");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  /**
   * 상위로 고를 수 있는 것 — **자기 자신과 자손을 뺍니다.**
   *
   * 서버도 순환을 막지만(`project-task.service.assertNoTaskCycle`), 고를 수
   * 없어야 할 것을 목록에 두면 눌러 본 사람이 오류를 봅니다.
   */
  const parentOptions = useMemo(() => {
    if (!editing) return tasks;
    const banned = new Set([editing.id]);
    // 목록이 트리 순서라 위에서 아래로 한 번만 훑으면 자손이 전부 걸립니다
    for (const t of tasks) {
      if (t.parentId && banned.has(t.parentId)) banned.add(t.id);
    }
    return tasks.filter((t) => !banned.has(t.id));
  }, [tasks, editing]);

  async function remove(t: Task) {
    const r = await deleteTaskAction(projectId, t.id, projectSlug);
    if (!r.ok) {
      toast.error(r.message ?? "지우지 못했습니다.");
      return;
    }
    toast.success("지웠습니다.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {[
            { k: "table" as const, label: "표", icon: Table2 },
            { k: "gantt" as const, label: "간트", icon: Diamond },
          ].map((v) => (
            <Button
              key={v.k}
              size="sm"
              variant={view === v.k ? "outline" : "ghost"}
              aria-pressed={view === v.k}
              onClick={() => setView(v.k)}
            >
              <v.icon className="size-4" />
              {v.label}
            </Button>
          ))}
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" />새 할 일
        </Button>
      </div>

      {tasks.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center text-sm">
          아직 할 일이 없습니다.
        </p>
      ) : view === "table" ? (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>할 일</TableHead>
                <TableHead className="w-28">담당</TableHead>
                <TableHead className="w-56">기간</TableHead>
                <TableHead className="w-20">상태</TableHead>
                <TableHead className="w-32">진행</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <span
                      className="inline-flex items-center gap-1.5"
                      style={{ paddingInlineStart: `${t.depth * 1.25}rem` }}
                    >
                      {t.isMilestone && (
                        <Diamond
                          className="size-3.5 shrink-0"
                          aria-label="마일스톤"
                        />
                      )}
                      <span className={cn(t.hasChildren && "font-medium")}>
                        {t.title}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {t.assignee?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm tabular-nums">
                    {t.effectiveStart ?? "…"} ~ {t.effectiveEnd ?? "…"}
                    {/*
                      **굴러 올라온 값임을 말해 줍니다.** 안 그러면 「내가 안
                      적은 날짜가 왜 있지」가 됩니다 (`FR-PROJ-012`).
                    */}
                    {t.hasChildren && (
                      <span className="ml-1 text-xs">(하위 합산)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {taskStatusLabel(t.status)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={t.effectiveProgress} className="h-1.5" />
                      <span className="text-muted-foreground w-8 shrink-0 text-right text-xs tabular-nums">
                        {t.effectiveProgress}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        aria-label={`${t.title} 고치기`}
                        onClick={() => setEditing(t)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        aria-label={`${t.title} 지우기`}
                        onClick={() => void remove(t)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <ProjectGantt
          projectId={projectId}
          projectSlug={projectSlug}
          tasks={tasks}
          links={links}
        />
      )}

      <TaskForm
        open={creating}
        onOpenChange={setCreating}
        projectId={projectId}
        projectSlug={projectSlug}
        parents={tasks}
        members={members}
        onDone={() => router.refresh()}
      />

      {editing && (
        <TaskForm
          // 고를 때마다 칸을 새로 잡습니다 (`docs-board` 와 같은 규칙)
          key={editing.id}
          open
          onOpenChange={(v) => !v && setEditing(null)}
          projectId={projectId}
          projectSlug={projectSlug}
          task={editing}
          parents={parentOptions}
          members={members}
          onDone={() => router.refresh()}
        />
      )}
    </div>
  );
}
