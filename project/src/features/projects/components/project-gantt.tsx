"use client";

import { ko } from "date-fns/locale";
import { useMemo } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { Gantt } from "@/components/reui/gantt/gantt";
import { GanttNav, GanttToolbar } from "@/components/reui/gantt/gantt-nav";
import type {
  GanttEvent,
  GanttResource,
} from "@/components/reui/gantt/gantt-types";
import { GanttView } from "@/components/reui/gantt/gantt-view";
import type { Task, TaskLink } from "@/server/services/project-task.service";
import { rescheduleTaskAction } from "@/server/actions/project.actions";

/**
 * 간트 (`FR-PROJ-014`·`015`·`016`·`017`).
 *
 * ReUI 간트(MIT)를 **우리 데이터에 잇는 어댑터**입니다. 베어 온 코드는
 * `components/reui/gantt/` 에 그대로 있고 (`DEC-070`), 이 파일이 우리 것과
 * 그쪽 사이의 유일한 접점입니다 — 다른 화면 코드는 간트를 직접 모릅니다.
 *
 * ## 시간대를 `UTC` 로 고정합니다
 *
 * 우리 날짜는 `date` 컬럼이고 서비스가 **UTC 자정**으로 만들어 넘깁니다
 * (`schema.toDate`). 간트를 서울 시간대로 돌리면 그 자정이 09:00 으로 읽혀
 * **막대가 하루의 3분의 1만큼 밀립니다.** 하루 단위 일정에 시간대는 값이
 * 없으므로 아예 UTC 로 못 박습니다.
 *
 * ## 끝은 «열린» 값입니다
 *
 * 간트의 `end` 는 **배타적**입니다(`GanttEvent` 주석). 9월 3일 하루짜리
 * 일은 `3일 ~ 4일` 로 줘야 3일 칸 하나를 채웁니다. 그대로 3일을 주면
 * 길이 0 이 되어 **아무것도 안 보입니다.**
 */

/** `YYYY-MM-DD` → UTC 자정 */
function at(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** 하루 뒤 — 배타적 끝을 만들 때 */
function nextDay(day: string): Date {
  const d = at(day);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/** UTC Date → `YYYY-MM-DD` */
function day(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * 한국어 문구 (`DEC-070`).
 *
 * 베어 온 간트는 **영어가 기본**입니다(`gantt-i18n` 이 따로 있다는 것이 그
 * 뜻입니다). 이 시스템은 한국어 단일이라(`REQ-01` 1.4) 화면에 나오는 것과
 * **읽어 주는 것**을 함께 바꿉니다 — 눈에 보이는 것만 바꾸면 화면 낭독기에는
 * 영어가 남습니다.
 *
 * 여기 없는 키는 원문 그대로입니다. 전부 옮기지 않은 것은 의도입니다 —
 * 안 쓰는 기능(반복 일정 등)의 문구까지 옮기면 무엇이 실제로 쓰이는지가
 * 흐려집니다.
 */
const KO = {
  labels: {
    today: "오늘",
    previous: "이전",
    next: "다음",
    addTask: "할 일 추가",
    allDay: "종일",
    loading: "불러오는 중",
    resources: "할 일",
    goToDate: "날짜로 이동",
    reorder: "순서 바꾸기",
    selectView: "기간 단위",
    zoomIn: "확대",
    zoomOut: "축소",
    resizePanel: "칸 너비 조절",
    milestone: "마일스톤",
    continues: "이어짐",
    progress: (percent: number) => `진행률 ${percent}%`,
    durationDays: (days: number) => `${days}일`,
    jumpToBar: (title: string) => `${title} 위치로`,
    scales: {
      day: "일",
      week: "주",
      month: "월",
      quarter: "분기",
      year: "년",
    },
  },
} as const;

export function ProjectGantt({
  projectId,
  projectSlug,
  tasks,
  links,
}: {
  projectId: string;
  projectSlug: string;
  tasks: Task[];
  links: TaskLink[];
}) {
  const router = useRouter();

  /** 왼쪽 나무 — 우리 트리를 그대로 옮깁니다 */
  const resources = useMemo<GanttResource[]>(() => {
    const byId = new Map<string, GanttResource>();
    for (const t of tasks) byId.set(t.id, { id: t.id, title: t.title });

    const roots: GanttResource[] = [];
    for (const t of tasks) {
      const node = byId.get(t.id)!;
      const parent = t.parentId ? byId.get(t.parentId) : undefined;
      if (parent) (parent.children ??= []).push(node);
      else roots.push(node);
    }
    return roots;
  }, [tasks]);

  const events = useMemo<GanttEvent[]>(() => {
    const dependsOn = new Map<string, string[]>();
    for (const l of links) {
      if (!dependsOn.has(l.toTaskId)) dependsOn.set(l.toTaskId, []);
      dependsOn.get(l.toTaskId)!.push(l.fromTaskId);
    }

    return tasks
      // 날짜가 없으면 막대가 없습니다 — 왼쪽 나무에는 그대로 보입니다
      .filter((t) => t.effectiveStart && t.effectiveEnd)
      .map((t) => ({
        id: t.id,
        title: t.title,
        start: at(t.effectiveStart!),
        end: nextDay(t.effectiveEnd!),
        allDay: true,
        resourceId: t.id,
        progress: t.effectiveProgress,
        dependencies: dependsOn.get(t.id),
        /*
         * **부모는 못 끕니다.** 그 기간은 자식에서 굴러 올라온 값이라
         * (`DEC-069`) 끌어 봐야 저장할 자리가 없습니다 — 놓는 순간
         * 원래대로 돌아가는 막대는 고장으로 읽힙니다.
         */
        readOnly: t.hasChildren,
      }));
  }, [tasks, links]);

  /**
   * 처음에 **일이 있는 곳**을 보여 줍니다.
   *
   * 그냥 두면 «오늘»이 열립니다. 9월에 만든 프로젝트의 일정이 10월이면
   * 화면에 막대가 하나도 없고, 그건 고장으로 읽힙니다 — 실측에서 그렇게
   * 열렸습니다. 가장 이른 시작일로 맞춥니다. 일정이 아직 없으면 오늘입니다.
   */
  const firstDay = useMemo(() => {
    const days = tasks
      .map((t) => t.effectiveStart)
      .filter((d): d is string => Boolean(d))
      .sort();
    return days[0] ? at(days[0]) : undefined;
  }, [tasks]);

  return (
    <div className="rounded-md border">
      <Gantt
        resources={resources}
        events={events}
        /*
         * 주 단위는 한 화면에 이레뿐입니다. 개발 일정은 대개 몇 주짜리라
         * **달 단위**로 열어야 전체가 보입니다 — 확대는 간트가 제공합니다.
         */
        defaultScale="month"
        defaultDate={firstDay}
        timeZone="UTC"
        locale={ko}
        i18n={KO}
        weekStartsOn={1}
        className="h-[32rem]"
        /*
         * **끌어 놓으면 서버가 정본입니다.** 화면 상태를 먼저 바꾸고 나중에
         * 저장하면, 저장이 실패했을 때 화면만 옮겨진 채로 남습니다.
         * 여기서는 저장하고 `router.refresh()` 로 서버 값을 다시 받습니다.
         */
        onEventUpdate={(update) => {
          const id = String(update.event.id);
          /*
           * 배타적 끝을 **하루 되돌려** 우리 값으로 만듭니다. 안 그러면
           * 저장할 때마다 종료일이 하루씩 밀려납니다.
           */
          const end = new Date(update.end);
          end.setUTCDate(end.getUTCDate() - 1);

          void (async () => {
            const r = await rescheduleTaskAction(
              projectId,
              id,
              projectSlug,
              day(update.start),
              day(end)
            );
            if (!r.ok) {
              toast.error(r.message ?? "일정을 바꾸지 못했습니다.");
            }
            // 성공이든 실패든 서버 값으로 되돌립니다
            router.refresh();
          })();

          // 놓는 즉시 그려 두고, 서버 값이 오면 덮입니다
          return true;
        }}
      >
        {/*
          **도구줄은 따로 붙여야 합니다.** `GanttView` 는 격자만 그립니다 —
          안 붙이면 일정이 지금 보이는 칸 밖에 있을 때 **거기로 갈 방법이
          없습니다.** 실측에서 오늘 주간만 보이고 9월 일정이 화면 밖이었습니다.
        */}
        <GanttToolbar>
          {/*
            **`GanttNav` 하나면 됩니다** — 오늘·앞뒤·눈금·제목이 다 들어
            있습니다. 처음에 `GanttTitle`·`GanttScaleSwitcher` 를 나란히
            더했다가 **제목과 눈금이 두 벌**로 그려졌습니다.
          */}
          <GanttNav />
        </GanttToolbar>
        <GanttView />
      </Gantt>
    </div>
  );
}
