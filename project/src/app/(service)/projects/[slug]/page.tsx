import { notFound } from "next/navigation";

import { ProjectDetailView } from "@/features/projects/components/project-detail-view";
import { todayYmd } from "@/features/projects/ymd";
import { AppError } from "@/lib/errors";
import { decodeSegment } from "@/lib/route-params";
import { requireActiveUser } from "@/server/auth/guards";
import * as itemService from "@/server/services/project-item.service";
import * as projectService from "@/server/services/project.service";

/**
 * 프로젝트 상세 — 이름·기간 + **타임라인** (`FR-PROJ-003` · `DEC-075`).
 *
 * 🔴 **탭이 없어졌습니다.** 옛 화면은 개요·문서·일정 셋을 탭으로 갈랐고, 그
 *    때문에 `layout.tsx` 가 머리와 탭을 그리며 프로젝트를 **한 번 더** 읽고
 *    있었습니다. 문서가 사라지고(`DEC-075`) 일정이 이 화면 자체가 되면서 탭이
 *    가리킬 곳이 하나뿐입니다 — 레이아웃과 함께 걷었습니다.
 *    ⚠️ 그 레이아웃은 인가를 **하지 않았습니다**(`DEC-035`: page 가 합니다).
 *       지우면서 잃은 방어선이 없습니다.
 *
 * 🔴 **한 겹에서 셋을 병렬로 읽습니다.** 서로 의존하지 않는 세 읽기를 직렬로
 *    두면 이 화면의 첫 바이트가 왕복 두 겹만큼 늦습니다. 관문
 *    (`requireActiveUser`)은 여전히 셋보다 먼저입니다.
 *
 * ⚠️ **항목을 프로젝트 id 로 읽습니다** — slug 가 아니라. slug 는 사람이 고칠
 *    수 있는 값이고(이름을 바꾸면 새 slug 가 나옵니다) 항목이 매달린 곳은
 *    id 입니다.
 */
export default async function ProjectDetailPage({
  params,
}: PageProps<"/projects/[slug]">) {
  // 반환값은 안 씁니다 — 「들어와도 되는가」만 묻습니다 (`DEC-035`)
  await requireActiveUser();
  // 한국어 slug 는 인코딩된 채로 옵니다 (`lib/route-params`)
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

  const [items, people] = await Promise.all([
    itemService.listFor(project.id),
    projectService.assignableMembers(),
  ]);

  return (
    <ProjectDetailView
      today={todayYmd()}
      project={{
        id: project.id,
        slug: project.slug,
        name: project.name,
        description: project.description,
        status: project.status,
        start: project.startsOn ?? null,
        end: project.endsOn ?? null,
        createdAt: project.createdAt,
        ownerName: project.owner.name,
      }}
      /* 🔴 **화면이 쓰는 칸만 넘깁니다.** `sortOrder`·`updatedAt` 을 함께 내리면
         클라이언트 번들에 안 쓰는 값이 실리고, 나중에 "그 값도 보여 줄까" 가
         됩니다. 차례는 이미 배열의 순서로 와 있습니다. */
      items={items.map((it) => ({
        id: it.id,
        title: it.title,
        start: it.startsOn ?? null,
        end: it.endsOn ?? null,
        progress: it.progress,
        // 🔴 **막대 색.** 안 내려보내면 «색을 골랐는데 새로고침하면 사라진다» 가
        //    되고, 저장은 멀쩡하므로 그 증상만으로는 어디가 끊겼는지 알 수 없습니다.
        color: it.color ?? null,
        /* 🔴 **수만 내려갑니다** — 본문은 대화를 열 때 서버 액션으로 옵니다.
           항목마다 댓글을 통째로 실으면 이 한 장이 그 무게를 전부 지는데,
           실제로 열어 보는 항목은 하나입니다. */
        commentCount: it.commentCount,
        /* 🔴 **담당자는 id 만** — 이름·얼굴은 아래 `people` 에서 찾습니다.
           항목마다 실어 보내면 같은 사람이 항목 수만큼 복제되고, 이름이
           바뀌는 날 한쪽만 낡습니다. */
        assigneeId: it.assigneeId ?? null,
      }))}
      people={people.map((p) => ({
        id: p.id,
        name: p.name,
        username: p.username,
        avatarUrl: p.avatarUrl,
      }))}
      /* 🔄 `canDelete={session.role === "ADMIN" || project.owner.id === session.userId}`
         가 여기 있었습니다 (`FR-PROJ-004`). `DEC-077` 로 service 쪽 판정
         (`assertCanDelete`)이 사라져 화면이 흉내 낼 원본이 없어졌습니다. */
    />
  );
}
