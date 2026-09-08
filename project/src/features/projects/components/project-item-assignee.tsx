"use client";

import { UserRound } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PersonAvatar,
  displayName,
  type ProjectPerson,
} from "@/features/projects/components/project-person";
import { cn } from "@/lib/utils";

/**
 * 항목의 **담당자** — 트리 줄 맨 앞의 얼굴 하나 (`FR-PROJ-013` · `DEC-075`).
 *
 * 🔴 **여기가 담당자를 그리는 유일한 자리입니다.** 간트(`project-gantt.tsx`)는 이
 *    컴포넌트를 **부를 뿐** 얼굴·이니셜을 직접 그리지 않습니다 — 댓글에 대해 한
 *    것과 같은 처리이고, 규칙을 푼 만큼 겹을 더합니다.
 *
 * 🔴 **자리는 언제나 차지합니다.** 미배정이면 얼굴 대신 **같은 크기의 빈 칸**을
 *    그립니다 — 안 그리면 담당자가 있는 줄과 없는 줄에서 **제목의 시작점이
 *    어긋나** 목록이 들쭉날쭉해집니다.
 *
 * 🔴 **이름·얼굴은 목록에서 찾습니다.** 항목이 들고 오는 것은 `assigneeId`
 *    뿐입니다 — 항목마다 이름을 실어 보내면 같은 사람이 항목 수만큼 복제되고,
 *    이름이 바뀌는 날 한쪽만 낡습니다.
 * ⚠️ 목록에 없는 id 면 **미배정처럼 그립니다**(빈 칸). 승인이 풀린 계정이 맡고
 *    있던 항목이 그 상태가 되는데, 화면이 «누군지 모를 얼굴» 을 그리는 것보다
 *    낫습니다. 새로 맡기는 것은 서버가 막습니다
 *    (`project-item.service.assertAssignable`).
 *
 * ⚠️ **원본(Orbee)의 명단과 다른 값이 옵니다.** 그쪽은 그 프로젝트의 참가자
 *    (`ProjectMember`)라 프로젝트마다 다르고, 우리는 **승인 회원 전원**입니다
 *    (`DEC-018`) — 그래서 「이 프로젝트에 없는 사람」이라는 갈래가 없습니다.
 */

/** 얼굴·빈 칸이 같은 크기여야 제목이 안 흔들립니다. `PersonAvatar` 의 `sm`(24px)과 같은 값 */
const SLOT = "size-6";

/** 「미배정」을 고르는 값. 빈 문자열은 메뉴에서 «안 고름» 과 구분이 안 됩니다 */
export const UNASSIGNED = "__none__";

export function ItemAssignee({
  assigneeId,
  people,
  canWrite,
  onAssign,
  className,
}: {
  assigneeId: string | null;
  /** 맡길 수 있는 사람 — `project.service.assignableMembers` 가 준 그대로 */
  people: ProjectPerson[];
  canWrite: boolean;
  /** `null` 이면 미배정으로 되돌립니다 */
  onAssign: (assigneeId: string | null) => void;
  className?: string;
}) {
  const assignee = people.find((m) => m.id === assigneeId) ?? null;

  const face = assignee ? (
    <PersonAvatar name={assignee.name} image={assignee.avatarUrl} />
  ) : (
    /* 🔴 **빈 칸이지 없는 칸이 아닙니다.** 자리를 비워 두는 것이 목적이라 크기가
       얼굴과 같아야 합니다. `aria-hidden` 인 이유: 낭독기에 «빈 그림» 을 읽어 줄
       것이 없습니다 — 담당자가 없다는 사실은 아래 버튼의 이름이 말합니다. */
    <span aria-hidden className={cn(SLOT, "shrink-0")} />
  );

  if (!canWrite) {
    return (
      <span
        data-slot="item-assignee"
        className={cn("flex shrink-0 items-center", className)}
        title={assignee ? displayName(assignee.name) : undefined}
      >
        {face}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-slot="item-assignee"
          aria-label={
            assignee ? `담당자 ${displayName(assignee.name)}` : "담당자 지정"
          }
          title={assignee ? displayName(assignee.name) : "담당자 지정"}
          className={cn(
            "focus-visible:ring-ring flex shrink-0 items-center rounded-full transition",
            "hover:opacity-80 focus-visible:ring-2 focus-visible:outline-none",
            className
          )}
          /* 🔴 줄 클릭(댓글 열기)과 부딪히지 않습니다 — 벤더의 줄 핸들러가
             `closest("button")` 으로 버튼을 비껴가지만, 드롭다운이 열릴 때의
             전파까지는 여기서 막아 둡니다. */
          onClick={(e) => e.stopPropagation()}
        >
          {assignee ? (
            face
          ) : (
            <span
              className={cn(
                SLOT,
                // 미배정 칸도 **눌러야 지정할 수 있습니다** — 그래서 hover 에서만 흐릿한
                // 사람 아이콘을 띄웁니다(평소에는 빈 칸으로 보이고, 마우스를 올리면
                // «여기를 누르면 된다» 가 됩니다).
                "text-muted-foreground/0 group-hover/row:text-muted-foreground/60 hover:!text-muted-foreground grid place-items-center rounded-full transition"
              )}
            >
              <UserRound className="size-3.5" aria-hidden />
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-72 w-48 overflow-y-auto"
      >
        <DropdownMenuLabel className="text-xs">담당자</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* 🔴 「미배정」이 **첫 칸**입니다 — 없으면 한 번 정한 담당자를 영영 못
            뗍니다(색 고르개의 「안 정함」과 같은 근거). */}
        <DropdownMenuItem
          data-assignee={UNASSIGNED}
          onSelect={() => onAssign(null)}
          className={cn("text-xs", assigneeId === null && "font-bold")}
        >
          미배정
        </DropdownMenuItem>
        {people.map((m) => (
          <DropdownMenuItem
            key={m.id}
            data-assignee={m.id}
            onSelect={() => onAssign(m.id)}
            className={cn("gap-2 text-xs", assigneeId === m.id && "font-bold")}
          >
            <PersonAvatar
              name={m.name}
              image={m.avatarUrl}
              className="size-5"
            />
            <span className="min-w-0 truncate">{displayName(m.name)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
