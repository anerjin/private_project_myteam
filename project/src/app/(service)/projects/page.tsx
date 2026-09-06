import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/common/page-header";
import { ProjectsBoard } from "@/features/projects/components/projects-board";
import { cn } from "@/lib/utils";
import { requireActiveUser } from "@/server/auth/guards";
import * as projectService from "@/server/services/project.service";

export const metadata: Metadata = { title: "프로젝트" };

/**
 * 프로젝트 목록 (`FR-PROJ-001`).
 *
 * **승인된 회원 전원이 전부 봅니다** (`DEC-018`). 개인 메모와 정반대라
 * 조회에 소유자 조건이 없습니다 — 그 사실을 `project.service` 머리에
 * 적어 두었습니다.
 *
 * 탭은 URL 로 둡니다(`?trash=1`) — 나의 노트·관리자 자료 화면과 같은 형태
 * (`DEC-045`).
 */
export default async function ProjectsPage({
  searchParams,
}: PageProps<"/projects">) {
  // 인가는 레이아웃이 아니라 page 가 한다 (`DEC-035`)
  const session = await requireActiveUser();
  const sp = await searchParams;
  const trash = sp.trash === "1";

  const [projects, liveCount, trashCount] = await Promise.all([
    projectService.list(trash),
    projectService.countLive(),
    projectService.countTrash(),
  ]);

  return (
    <>
      <PageHeader
        title="프로젝트"
        description="기획·디자인·개발 문서와 일정을 한 곳에 둡니다. 팀 전원이 봅니다."
        count={trash ? trashCount : liveCount}
      />

      <div className="flex gap-2 border-b">
        {[
          { label: "진행", href: "/projects", active: !trash, n: liveCount },
          {
            label: "휴지통",
            href: "/projects?trash=1",
            active: trash,
            n: trashCount,
          },
        ].map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              t.active
                ? "border-foreground font-medium"
                : "text-muted-foreground border-transparent"
            )}
          >
            {t.label}
            <span className="ml-1.5 tabular-nums">{t.n}</span>
          </Link>
        ))}
      </div>

      <ProjectsBoard
        projects={projects}
        trash={trash}
        viewerId={session.userId}
        viewerIsAdmin={session.role === "ADMIN"}
      />
    </>
  );
}
