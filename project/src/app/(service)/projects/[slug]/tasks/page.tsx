import { notFound } from "next/navigation";

import { TasksBoard } from "@/features/projects/components/tasks-board";
import { AppError } from "@/lib/errors";
import { decodeSegment } from "@/lib/route-params";
import { requireActiveUser } from "@/server/auth/guards";
import * as taskService from "@/server/services/project-task.service";
import * as projectService from "@/server/services/project.service";

/**
 * 할 일 · 일정 (`FR-PROJ-010`~`017`).
 *
 * 표와 간트가 **같은 데이터**를 봅니다. 서버가 한 번 계산해 둘 다에게
 * 넘깁니다 — 각자 부르게 두면 굴러 올라온 값(`effective*`)이 서로 달라집니다.
 */
export default async function ProjectTasksPage({
  params,
}: PageProps<"/projects/[slug]/tasks">) {
  await requireActiveUser();
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

  const [tasks, links, members] = await Promise.all([
    taskService.listFor(project.id),
    taskService.listLinks(project.id),
    projectService.assignableMembers(),
  ]);

  return (
    <TasksBoard
      projectId={project.id}
      projectSlug={project.slug}
      tasks={tasks}
      links={links}
      members={members}
    />
  );
}
