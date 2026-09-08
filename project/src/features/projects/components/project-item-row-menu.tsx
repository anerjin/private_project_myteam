"use client";

import { MoreVertical } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  COLOR_CHOICES,
  COLOR_SWATCH_CELL,
  ColorSwatch,
  NO_COLOR,
} from "@/features/projects/components/project-gantt-color-picker";
import type { ProjectItemCard } from "@/features/projects/components/project-gantt-model";
import {
  toGanttColorKey,
  type GanttColorKey,
} from "@/features/projects/schema";

/**
 * 🔴 **트리 줄의 ⋯ 메뉴** (`DEC-075`).
 *
 * 🔴 **기간 없는 항목의 유일한 경로입니다.** 그런 항목은 막대가 아예 없어서
 *    (`toGanttEvents` 의 `if (!span) continue`) 막대 우클릭 메뉴에 닿을 길이
 *    없습니다 — 이름도 색도 삭제도 여기서만 합니다.
 * 🔴 **막대 메뉴와 같은 동작을 부릅니다** — 이름은 `setRenaming`, 색은
 *    `changeColor`, 삭제는 `setDeleting` 입니다.
 *    ⛔ 두 벌로 만들지 않습니다: 여기서 따로 저장하면 낙관적 갱신·롤백이 두
 *       곳이 됩니다.
 * 🔴 **색 목록도 같은 것**(`COLOR_CHOICES`)입니다 — 값 목록이 한 곳입니다.
 *
 * 🔴 **삭제가 여기 있는 것은 「한 번의 누름 거리」가 아닙니다.** 이 항목이
 *    부르는 것은 지우는 일이 아니라 `onDelete`(= `setDeleting`)이고, 실제로
 *    지우는 것은 **확인 대화의 「삭제」**입니다. 막대 우클릭 메뉴가 이미 그렇게
 *    살고 있고, 여기는 **그 경로에 입구를 하나 더 여는 것**뿐입니다.
 *    ⛔ 두 번째 삭제 경로·두 번째 확인 대화를 만들지 않습니다.
 * ⛔ **진척률은 여기 없습니다.** 막대 우클릭 메뉴에 이미 있고, 진척률을 찍는
 *    항목에는 언제나 막대가 있습니다(기간이 있어야 진척이 뜻을 갖습니다).
 */
export function ItemRowMenu({
  item,
  onRename,
  onColor,
  onDelete,
}: {
  item: ProjectItemCard;
  onRename: (item: ProjectItemCard) => void;
  onColor: (item: ProjectItemCard, color: GanttColorKey | null) => void;
  /** 🔴 **지우지 않습니다 — 확인 대화를 엽니다.** 막대 메뉴와 같은 `setDeleting` 이 옵니다 */
  onDelete: (item: ProjectItemCard) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-slot="item-row-menu"
          aria-label={`${item.title} 메뉴`}
          /* 🔴 **`ms-auto` 가 줄의 오른쪽 끝으로 밉니다.**
             ⚠️ `shrink-0` 이 **제목이 길어도 ⋯ 가 안 밀리는** 근거입니다 —
                줄어드는 것은 `truncate` 가 걸린 제목 쪽입니다. `-me-1` 은
                이름칸의 안쪽 여백으로 반 칸 파고들어 아이콘이 줄 끝에 붙어
                보이게 합니다. */
          className="focus-visible:ring-ring text-muted-foreground hover:text-foreground ms-auto -me-1 flex size-5 shrink-0 items-center justify-center rounded transition focus-visible:ring-2 focus-visible:outline-none"
        >
          <MoreVertical className="size-3.5" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      {/*
        🔢 **폭을 숫자로 정합니다.** 🔴 **여기는 안 정하면 잘립니다** — 우리 ui 의
           `DropdownMenuContent` 는 `w-(--radix-dropdown-menu-trigger-width)` 로
           **트리거 폭**(여기서는 20px)을 쓰고 `min-w-32` 로 받쳐 두는데, `width`
           가 박혀 있으면 내용이 넓어도 상자가 안 늘고 `overflow-x-hidden` 이
           그것을 잘라 냅니다. 그래서 폭을 직접 줍니다:
           124(`COLOR_GRID_W`) + 4+4(`p-1` 양쪽) = **132px**.
           ⚠️ 「이름 바꾸기」 한 줄은 이보다 좁습니다. 가장 넓은 것이 견본
              그리드라 그 숫자가 곧 메뉴 폭입니다.
        📱 `collisionPadding` — 폰에서 `align="end"` 가 화면 가장자리에 닿으면
           Radix 가 안쪽으로 밉니다(기본 `avoidCollisions`). 여백을 적어 두어
           가장자리에 **붙지** 않게 합니다.
      */}
      <DropdownMenuContent
        align="end"
        collisionPadding={8}
        className="w-[132px] min-w-0"
      >
        <DropdownMenuItem onSelect={() => onRename(item)}>
          이름 바꾸기
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>색</DropdownMenuLabel>
        {/* 🎨 **이름 글자 없이 큰 원 4열**. 이름은 `aria-label` 로 남고
            (`GANTT_COLOR_LABEL` 이 그 정본이라 계속 삽니다), `data-color` 는
            세 자리가 **같은 목록에서 왔는가**를 값으로 맞대 보는 손잡이입니다. */}
        <DropdownMenuRadioGroup
          className="grid grid-cols-4 gap-1"
          value={item.color ?? NO_COLOR}
          onValueChange={(v) =>
            onColor(item, v === NO_COLOR ? null : toGanttColorKey(v))
          }
        >
          {COLOR_CHOICES.map((c) => (
            <DropdownMenuRadioItem
              key={c.value}
              value={c.value}
              data-color={c.value}
              aria-label={c.label}
              title={c.label}
              className={COLOR_SWATCH_CELL}
            >
              <ColorSwatch color={c.key} />
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {/* 🔴 **삭제 — 막대 우클릭 메뉴와 같은 자리로 갑니다.** 여기서 하는 일은
            `onDelete`(= `setDeleting`) 하나이고, 그러면 화면 아래쪽의 **그 확인
            대화**가 열립니다 — 이 메뉴는 자기 대화도 자기 저장도 갖지 않습니다.
            ⚠️ **구분선이 색 그리드와 사이를 벌립니다** — 색 원 바로 밑에 붙으면
               색을 고르다 누릅니다. 되돌릴 수 없는 것이라 그 한 칸이 값을 합니다.
            ⚠️ 권한은 이 메뉴를 **그릴지 말지**로 이미 갈렸습니다(호출부) —
               여기서 다시 판정하지 않습니다. */}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(item)}>
          삭제
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
