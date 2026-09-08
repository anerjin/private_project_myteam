import { ChevronLeft } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { ProjectGantt } from "@/features/projects/components/project-gantt";
import type { ProjectItemCard } from "@/features/projects/components/project-gantt-model";
import type { ProjectPerson } from "@/features/projects/components/project-person";
import { ProjectSpanDialog } from "@/features/projects/components/project-span-edit";
import { ProjectTrashButton } from "@/features/projects/components/project-trash-button";
import { fmtSpanDate, projectSpan } from "@/features/projects/project-span";
import { statusLabel } from "@/features/projects/schema";

/**
 * 프로젝트 상세 — 이름·기간 + **타임라인** (`FR-PROJ-003` · `DEC-075`).
 *
 * 🔴 **`"use client"` 가 없습니다.** 머리말에는 상태도 조작도 없습니다 —
 *    클라이언트로 내려가는 것은 간트와 대화 상자들뿐이고, 각자 자기 파일에
 *    `"use client"` 를 달고 있습니다.
 *
 * 🔴 **간트는 여기서만 import 합니다.** 목록(`projects-view.tsx`)이 같은 것을
 *    끌어오면 가벼워야 할 화면이 벤더 380KB 를 지고 갑니다.
 *
 * ## 🔄 원본에서 없어진 것 — 「참가자」 자리
 *
 * 원본(Orbee)의 상세 머리말에는 참가자 얼굴 묶음과 **초대 버튼**이 섭니다.
 * 우리에게는 `ProjectMember` 도 `ProjectInvite` 도 없고(`DEC-075`), **승인된
 * 회원 전원이 모든 프로젝트를 봅니다**(`DEC-018`) — 「이 프로젝트에 누가
 * 들어와 있는가」라는 물음 자체가 성립하지 않습니다.
 *
 * 그 자리를 **만든 사람 한 줄**로 바꿨습니다. 얼굴 묶음을 사내 전원으로 채우는
 * 길도 있었지만 그건 「참가자」가 아니라 「회원 명부」이고, 프로젝트마다 똑같은
 * 스무 개의 얼굴이 서는 화면은 아무것도 말하지 않습니다. 만든 사람은 다릅니다 —
 * **이 프로젝트에 대해 갈리는 유일한 사실**이고, 그 이름이 곧 「누가 이걸 지울
 * 수 있는가」입니다(`FR-PROJ-004`).
 */
export function ProjectDetailView({
  project,
  items,
  people,
  today,
}: {
  project: {
    id: string;
    slug: string;
    name: string;
    description?: string;
    status: string;
    start: string | null;
    end: string | null;
    createdAt: string;
    ownerName: string;
  };
  /** 이 프로젝트의 항목들. 간트가 **controlled 로** 받는 씨앗입니다 */
  items: ProjectItemCard[];
  /** 담당자로 고를 수 있는 사람 — 승인 회원 전원입니다 (`DEC-018`) */
  people: ProjectPerson[];
  /** 오늘(YYYY-MM-DD). 서버가 정해 내려보냅니다 — 목록과 같은 규약 */
  today: string;
  /** 휴지통 버튼을 그릴지 — ⚠️ **관문이 아닙니다**(service 의 `assertCanDelete`) */
}) {
  const span = projectSpan(project.start, project.end, today);

  return (
    /*
     * 🔴 **높이가 여기서 정해집니다.** 간트는 부모 높이를 채우는 구조라
     *    (`flex-1 min-h-0`) 부모에 높이가 없으면 0px 이 되어 통째로 사라집니다.
     *    데스크톱에서만 뷰포트를 채우고(`xl:h-[calc(100dvh-...)]`) 좁은 폭에는
     *    높이를 안 겁니다 — 거기서는 본문 전체가 구르고, 간트 카드가 자기
     *    높이(`max-xl:h-[70dvh]`)로 섭니다.
     * ⚠️ `10rem` 은 셸의 머리와 이 화면의 머리말 몫입니다. 정확한 픽셀이 아니라
     *    **넉넉히 잡은 값**이고, 모자라면 카드가 조금 작아질 뿐 아무것도 안
     *    깨집니다(넘치면 페이지가 구릅니다).
     *
     * 🔴 **`w-0 min-w-full` 이 폭을 자릅니다 — 이게 없으면 화면 전체가 가로로
     *    넘칩니다.** 실측(1600px 창): 셸의 `<main>` 이 1344 가 아니라 **1600** 이
     *    되어 사이드바(256)와 합쳐 1856이 되고, 상단 바까지 오른쪽으로 밀립니다.
     *
     *    원인은 간트 안쪽입니다 — 벤더가 타임라인 줄에 **픽셀 `min-width` 를 직접**
     *    박아 두는데(축 전체 폭), 그 최소 폭이 조상들을 타고 올라가 셸의
     *    `<main>`(`flex-1`, `min-width:auto`)을 밀어냅니다.
     * ⚠️ **막을 수 있을 것 같은 것들이 다 안 됩니다.** 실측으로 하나씩 던져 봤습니다:
     *      - 카드의 `overflow-hidden`(이미 있습니다) · 카드의 `min-w-0` → 안 됨
     *      - 이 `<section>` 에 `overflow-hidden`/`overflow-x-clip` → 안 됨
     *        (`flex` 컨테이너라 최소폭 전파가 안 끊깁니다)
     *      - 카드를 `overflow-hidden` 블록으로 감싸기 → 안 됨
     *    되는 것은 둘이었습니다: 셸의 `<main>` 에 `overflow-hidden`(**남의 파일**)과
     *    여기 `w-0 min-w-full`(= 폭 0에서 출발해 부모 폭까지만 늘어남). 뒤엣것을
     *    골랐습니다 — 다른 화면을 안 건드립니다.
     * ⚠️ 이 저장소는 같은 문제를 이미 알고 있습니다 — 넓은 표를 쓰는 화면들이
     *    저마다 `overflow-x-auto` 로 감쌉니다(`my-tasks` 가 그 예). 셸이 아니라
     *    **화면이 자기 폭을 책임지는** 것이 여기 관례입니다.
     */
    <section className="flex w-0 min-w-full flex-col xl:h-[calc(100dvh-10rem)]">
      <Link
        href="/projects"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[13px] font-semibold transition"
      >
        <ChevronLeft className="size-4" /> 프로젝트
      </Link>

      <header className="mt-2 mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold">{project.name}</h1>
            <Badge variant="secondary">{statusLabel(project.status)}</Badge>
          </div>
          {/* ⛔ **긴 꼴 그대로입니다** — 카드가 짧은 꼴을 쓰는 것은 폭이 없어서고
              (`project-span.ts` 의 `shortLabel` 주석), 여기는 폭이 남습니다. */}
          <p className="text-muted-foreground mt-1.5 text-[13px] tabular-nums">
            {span.label} · 만든 사람 {project.ownerName} · 만든 날{" "}
            {fmtSpanDate(project.createdAt, today)}
          </p>
          {project.description && (
            <p className="text-muted-foreground mt-1.5 text-[13px]">
              {project.description}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* 🔄 **전원이 누릅니다** — 원본은 소유자 전용입니다. 우리는 고치는 것이
              전원이고(`DEC-018`) 목록의 수정 폼도 그렇습니다. 그 파일의 머리말이
              근거를 적어 두었습니다. */}
          <ProjectSpanDialog
            projectId={project.id}
            projectSlug={project.slug}
            projectName={project.name}
            start={project.start}
            end={project.end}
          />
          {/* 🔴 **삭제만 소유자·`ADMIN` 입니다** (`FR-PROJ-004`) — 못 누를 버튼은
              안 그립니다. ⚠️ 관문은 service 의 `assertCanDelete` 입니다. */}
          <ProjectTrashButton
            projectId={project.id}
            projectName={project.name}
          />
        </div>
      </header>

      <ProjectGantt
        projectId={project.id}
        projectSlug={project.slug}
        project={{ start: project.start, end: project.end }}
        items={items}
        today={today}
        people={people}
      />
    </section>
  );
}
