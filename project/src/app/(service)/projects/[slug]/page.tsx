import { CalendarRange, FileText, ListTodo } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ProjectOverviewActions } from "@/features/projects/components/project-overview-actions";
import { SECTIONS, taskStatusLabel } from "@/features/projects/schema";
import { AppError } from "@/lib/errors";
import { decodeSegment } from "@/lib/route-params";
import { requireActiveUser } from "@/server/auth/guards";
import * as docService from "@/server/services/project-doc.service";
import * as taskService from "@/server/services/project-task.service";
import * as projectService from "@/server/services/project.service";

/**
 * 프로젝트 개요 (`FR-PROJ-003`).
 *
 * 한 화면에 **일정 요약 · 구획별 문서 수 · 임박한 할 일**을 둡니다.
 * 「최근 변경」은 활동 기록(`FR-PROJ-020`, `P2`)이 생기면 그 자리에 붙습니다 —
 * 지금은 없는 것을 있는 척하지 않습니다.
 */
export default async function ProjectOverviewPage({
  params,
}: PageProps<"/projects/[slug]">) {
  const session = await requireActiveUser();
  // 한국어 slug 는 인코딩된 채로 옵니다 (`lib/route-params`)
  const { slug: rawSlug } = await params;
  const slug = decodeSegment(rawSlug);

  let project;
  try {
    project = await projectService.getBySlug(slug);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }

  const [docCounts, tasks] = await Promise.all([
    docService.countsBySection(project.id),
    taskService.listFor(project.id),
  ]);

  const pct =
    project.taskCount > 0
      ? Math.round((project.doneCount / project.taskCount) * 100)
      : null;

  /*
   * 임박한 것 다섯. **끝난 것은 뺍니다** — 개요에서 보고 싶은 것은 남은
   * 일이지 지나간 일이 아닙니다. 날짜 없는 것은 뒤로 갑니다.
   */
  const upcoming = tasks
    .filter((t) => t.status !== "DONE")
    .sort((a, b) => (a.effectiveEnd ?? "9999").localeCompare(b.effectiveEnd ?? "9999"))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground flex items-center gap-1.5 text-sm font-normal">
              <CalendarRange className="size-4" />
              기간
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-medium tabular-nums">
              {project.startsOn ?? "미정"} ~ {project.endsOn ?? "미정"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground flex items-center gap-1.5 text-sm font-normal">
              <ListTodo className="size-4" />
              진행
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pct === null ? (
              <p className="text-muted-foreground text-sm">
                아직 할 일이 없습니다
              </p>
            ) : (
              <>
                <p className="text-lg font-medium tabular-nums">{pct}%</p>
                <Progress value={pct} />
                <p className="text-muted-foreground text-xs tabular-nums">
                  {project.doneCount}/{project.taskCount} 완료
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground flex items-center gap-1.5 text-sm font-normal">
              <FileText className="size-4" />
              문서
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-medium tabular-nums">
              {project.docCount}건
            </p>
            <p className="text-muted-foreground text-xs">
              {SECTIONS.map((s) => `${s.label} ${docCounts[s.value]}`).join(" · ")}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {SECTIONS.map((s) => (
          <Card key={s.value}>
            <CardHeader>
              <CardTitle className="text-base">{s.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-muted-foreground text-sm">
                문서 {docCounts[s.value]}건
              </p>
              <Link
                href={`/projects/${project.slug}/docs/${s.slug}`}
                className="text-sm underline underline-offset-4"
              >
                {s.label} 문서 열기
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">임박한 할 일</CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              남은 할 일이 없습니다.
            </p>
          ) : (
            <ul className="divide-y">
              {upcoming.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="truncate">{t.title}</span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    {t.effectiveEnd ?? "기한 없음"} · {taskStatusLabel(t.status)}
                    {t.assignee ? ` · ${t.assignee.name}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href={`/projects/${project.slug}/tasks`}
            className="mt-3 inline-block text-sm underline underline-offset-4"
          >
            일정 전체 보기
          </Link>
        </CardContent>
      </Card>

      <ProjectOverviewActions
        project={project}
        canDelete={session.role === "ADMIN" || project.owner.id === session.userId}
      />
    </div>
  );
}
