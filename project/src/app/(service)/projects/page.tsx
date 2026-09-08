import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/common/page-header";
import { ProjectsView } from "@/features/projects/components/projects-view";
import { todayYmd } from "@/features/projects/ymd";
import { cn } from "@/lib/utils";
import { requireActiveUser } from "@/server/auth/guards";
import * as projectService from "@/server/services/project.service";

export const metadata: Metadata = { title: "프로젝트" };

/**
 * 프로젝트 목록 (`FR-PROJ-001` · `DEC-075`).
 *
 * **승인된 회원 전원이 전부 봅니다** (`DEC-018`). 개인 메모와 정반대라
 * 조회에 소유자 조건이 없습니다 — 그 사실을 `project.service` 머리에
 * 적어 두었습니다.
 *
 * 탭은 URL 로 둡니다(`?trash=1`) — 나의 노트·관리자 자료 화면과 같은 형태
 * (`DEC-045`).
 *
 * 🔴 **「오늘」을 서버가 한 번 정합니다.** 카드마다 브라우저에서 `new Date()` 를
 *    부르면 ① 서버가 그린 HTML 과 브라우저가 다시 그린 것이 자정 근처에서
 *    갈리고 ② 시간대가 다른 기기에서 하루가 밀립니다.
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
        description="기간을 가진 일의 묶음입니다. 팀 전원이 봅니다."
        count={trash ? trashCount : liveCount}
      />

      <div className="mb-4 flex gap-2 border-b">
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

      <ProjectsView
        projects={projects}
        trash={trash}
        today={todayYmd()}
        viewerId={session.userId}
        viewerIsAdmin={session.role === "ADMIN"}
      />
    </>
  );
}
