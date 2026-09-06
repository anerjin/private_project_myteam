"use client";

import { CalendarRange, FileText, ListTodo, Plus, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ProjectForm } from "@/features/projects/components/project-form";
import { statusLabel } from "@/features/projects/schema";
import type { ProjectSummary } from "@/server/services/project.service";
import {
  deleteProjectAction,
  restoreProjectAction,
} from "@/server/actions/project.actions";

/**
 * 프로젝트 목록 (`FR-PROJ-001`·`004`).
 *
 * **삭제 단추를 «보여 줄지»도 판정합니다.** 서버가 다시 막지만(`DEC-069`의
 * 소유자·`ADMIN` 규칙), 눌러 봐야 거절당하는 단추는 없느니만 못합니다.
 * 판정 자체는 서버가 정본입니다 — 여기 것은 «보여 주기»입니다.
 */
export function ProjectsBoard({
  projects,
  trash,
  viewerId,
  viewerIsAdmin,
}: {
  projects: ProjectSummary[];
  trash: boolean;
  viewerId: string;
  viewerIsAdmin: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const canDelete = (p: ProjectSummary) =>
    viewerIsAdmin || p.owner.id === viewerId;

  async function remove(p: ProjectSummary) {
    const r = await deleteProjectAction(p.id);
    if (!r.ok) {
      toast.error(r.message ?? "옮기지 못했습니다.");
      return;
    }
    toast.success("휴지통으로 옮겼습니다.");
    router.refresh();
  }

  async function restore(p: ProjectSummary) {
    const r = await restoreProjectAction(p.id);
    if (!r.ok) {
      toast.error(r.message ?? "되살리지 못했습니다.");
      return;
    }
    toast.success("되살렸습니다.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {!trash && (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" />새 프로젝트
          </Button>
        </div>
      )}

      {projects.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center text-sm">
          {trash
            ? "휴지통이 비어 있습니다."
            : "아직 프로젝트가 없습니다. 오른쪽 위에서 만드십시오."}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            /*
             * 진행률은 **할 일 기준**입니다. 할 일이 없으면 0% 가 아니라
             * «아직 없음»입니다 — 0% 로 그리면 시작도 안 한 것처럼 보입니다.
             */
            const pct =
              p.taskCount > 0
                ? Math.round((p.doneCount / p.taskCount) * 100)
                : null;

            return (
              <Card key={p.id} className="flex flex-col">
                <CardHeader className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-snug">
                      {trash ? (
                        <span className="text-muted-foreground">{p.name}</span>
                      ) : (
                        <Link
                          href={`/projects/${p.slug}`}
                          className="hover:underline underline-offset-4"
                        >
                          {p.name}
                        </Link>
                      )}
                    </CardTitle>
                    <Badge variant="secondary">{statusLabel(p.status)}</Badge>
                  </div>
                  {p.description && (
                    <p className="text-muted-foreground line-clamp-2 text-sm">
                      {p.description}
                    </p>
                  )}
                </CardHeader>

                <CardContent className="mt-auto space-y-3">
                  {(p.startsOn || p.endsOn) && (
                    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                      <CalendarRange className="size-3.5" />
                      {p.startsOn ?? "…"} ~ {p.endsOn ?? "…"}
                    </p>
                  )}

                  <div className="text-muted-foreground flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1">
                      <FileText className="size-3.5" />
                      문서 {p.docCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <ListTodo className="size-3.5" />
                      할 일 {p.taskCount}
                    </span>
                  </div>

                  {pct !== null && (
                    <div className="space-y-1">
                      <Progress value={pct} />
                      <p className="text-muted-foreground text-xs tabular-nums">
                        {p.doneCount}/{p.taskCount} 완료 · {pct}%
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">
                      {p.owner.name}
                    </span>
                    {trash ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void restore(p)}
                      >
                        <Undo2 className="size-4" />
                        되살리기
                      </Button>
                    ) : (
                      canDelete(p) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`${p.name} 휴지통으로`}
                          onClick={() => void remove(p)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ProjectForm
        open={creating}
        onOpenChange={setCreating}
        onDone={() => router.refresh()}
      />
    </div>
  );
}
