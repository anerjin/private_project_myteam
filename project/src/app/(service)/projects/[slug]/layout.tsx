import { notFound } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { ProjectTabs } from "@/features/projects/components/project-tabs";
import { statusLabel } from "@/features/projects/schema";
import { AppError } from "@/lib/errors";
import { decodeSegment } from "@/lib/route-params";
import { requireActiveUser } from "@/server/auth/guards";
import * as projectService from "@/server/services/project.service";

/**
 * 프로젝트 한 채의 껍데기.
 *
 * **인가는 여기서 하지 않습니다** (`DEC-035`) — 각 page 가 `requireActiveUser`
 * 를 부릅니다. 여기서 부르는 것은 **머리와 탭을 그리기 위해서**이고, 그것이
 * 인가를 «대신»하지는 않습니다. Next.js 의 Partial Rendering 때문에 레이아웃이
 * 다시 실행되지 않을 수 있고, 그러면 여기의 리다이렉트가 아무것도 못 막습니다.
 *
 * 탭이 레이아웃에 있는 이유는 **개요·문서·일정이 오갈 때 머리가 다시 그려지지
 * 않게** 하기 위해서입니다.
 */
export default async function ProjectLayout({
  children,
  params,
}: LayoutProps<"/projects/[slug]">) {
  await requireActiveUser();
  /*
   * **`decodeSegment` 를 반드시 지납니다.** 프로젝트 이름이 한국어면 slug 도
   * 한국어이고, `params` 에는 퍼센트 인코딩된 채로 들어옵니다 — 그대로
   * 조회하면 **전부 404** 입니다. 이 저장소가 `P4`~`P6` 동안 겪은 바로 그
   * 구멍이고(`lib/route-params` 주석), 여기서 똑같이 한 번 더 겪었습니다.
   */
  const { slug: rawSlug } = await params;
  const slug = decodeSegment(rawSlug);

  let project;
  try {
    project = await projectService.getBySlug(slug);
  } catch (e) {
    // 없는 프로젝트와 휴지통에 든 프로젝트를 **같이** 다룹니다
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }

  return (
    <>
      <PageHeader
        title={project.name}
        description={project.description}
        action={<Badge variant="secondary">{statusLabel(project.status)}</Badge>}
      />
      <ProjectTabs
        slug={project.slug}
        counts={{ docs: project.docCount, tasks: project.taskCount }}
      />
      {children}
    </>
  );
}
