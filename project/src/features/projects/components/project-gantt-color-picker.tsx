"use client";

import {
  GANTT_COLOR_KEYS,
  GANTT_COLOR_LABEL,
  type GanttColorKey,
} from "@/features/projects/schema";
import { ganttColorCss } from "@/features/projects/gantt-color-css";

/**
 * 색 고르개의 «부품» (`FR-PROJ-014` · `DEC-074`).
 *
 * **여기에는 상태도 저장도 없습니다** — 고를 수 있는 값의 목록과, 그것을
 * 그리는 모양뿐입니다. 누가 무엇을 저장하는지는 부르는 쪽이 압니다
 * (폼은 `task-form`, 간트 막대는 `project-gantt`).
 *
 * 파일을 따로 둔 이유는 **값 목록을 한 곳에 두기 위해서**입니다. 지금 색을
 * 고르는 자리가 둘(할 일 폼 · 간트 막대 우클릭 메뉴)인데, 둘이 각자
 * `GANTT_COLOR_KEYS.map(...)` 을 적으면 오늘은 결과가 같습니다. 갈리는 것은
 * 한쪽에 「안 정함」을 빼거나 순서를 손보는 날이고, 그때 나머지 하나는
 * 조용히 옛 모양으로 남습니다.
 */

/**
 * 「안 정함」의 화면 값 — 메뉴의 라디오도, 폼의 목록도 이것을 씁니다.
 *
 * **빈 문자열을 쓰지 않습니다.** Radix 는 고른 값을 `===` 로 비교하는데
 * `""` 는 «값 없음»과 구분이 안 되고, 그러면 「안 정함」을 골라도 표시가
 * 안 붙습니다 — 폼의 담당자·상위 칸이 `NONE` 을 두는 것과 같은 이유입니다.
 *
 * **저장될 수 없는 모양이어야 합니다.** 이 문자열은 `isGanttColorKey` 가
 * 거짓을 내므로 (`features/projects/schema`) 실수로 흘러가도 서버에서
 * 멈춥니다. 다만 부르는 두 곳이 저장 전에 각자 `null`·`""` 로 바꿔 보내므로
 * 그 자리까지 갈 일은 없습니다.
 */
export const NO_COLOR = "__none__";

/**
 * 고를 수 있는 색 — **두 자리가 이 배열 하나를 돕니다.**
 *
 * 「안 정함」이 **맨 앞이고 언제나 있습니다** — 없으면 한 번 고른 색을
 * 영영 못 지웁니다.
 */
export const COLOR_CHOICES: ReadonlyArray<{
  /** 화면이 쥐는 값. 「안 정함」만 저장될 수 없는 모양(`NO_COLOR`)입니다 */
  value: string;
  /** 저장되는 값 — `null` 이면 「안 정함」입니다 */
  key: GanttColorKey | null;
  label: string;
}> = [
  { value: NO_COLOR, key: null, label: "안 정함" },
  ...GANTT_COLOR_KEYS.map((key) => ({
    value: key,
    key,
    label: GANTT_COLOR_LABEL[key],
  })),
];

/**
 * 색 견본 한 점 — **두 자리가 같은 원을 씁니다.**
 *
 * 색 이름만 늘어놓으면 「황금」과 「주황」을 못 고릅니다. 실제 색을 보입니다.
 * 값은 벤더 팔레트에서 옵니다 (`ganttColorCss`) — 우리가 CSS 를 적지
 * 않습니다.
 *
 * 「안 정함」도 **원 하나**입니다(가위표만 든 빈 원). 자리를 비워 두면
 * 한 번 고른 색을 지우는 길이 없어집니다.
 *
 * 원본 저장소에는 이것 말고 `ColorDot`(size-3)이 하나 더 있었습니다 —
 * 폼의 견본이 「점을 감싸는 상자」였기 때문입니다. 원본의 주석도 그 둘이
 * 갈린 것을 «그때 지적의 범위 밖이라 남겨 둔 것»이라고 적고 있습니다.
 * 옮기는 김에 하나로 합쳤습니다 — 크기가 둘이면 한쪽만 손보는 날이 옵니다.
 */
export function ColorSwatch({ color }: { color: GanttColorKey | null }) {
  return color === null ? (
    <span
      aria-hidden
      className="border-foreground/30 text-muted-foreground flex size-5 items-center justify-center rounded-full border text-[10px] leading-none"
    >
      ✕
    </span>
  ) : (
    <span
      aria-hidden
      className="border-foreground/20 size-5 rounded-full border"
      style={{ background: ganttColorCss(color) }}
    />
  );
}

/**
 * 견본 한 칸의 모양 — 원을 감싸는 «누를 수 있는 칸» 입니다.
 * **우클릭 메뉴 전용**입니다(폼은 이름이 보이는 목록을 씁니다 —
 * `task-form` 의 색 칸 주석).
 *
 * **글자가 없으므로 Radix 가 넣어 두는 체크 표시를 감춥니다.**
 * `ContextMenuRadioItem` 은 오른쪽 끝(`absolute right-2`)에 체크를
 * 절대배치하고 `pr-8` 로 그 자리를 비워 둡니다 — 28px 짜리 칸에서는 체크가
 * 원 **위에** 겹쳐 찍힙니다. 그 span 을 감추고, 골라진 것은 **원 둘레의
 * 링**으로 말합니다. `aria-checked` 는 Radix 가 붙인 그대로 살아 있습니다 —
 * 바꾼 것은 그림뿐입니다.
 *
 * `data-checked:` 는 이 저장소의 표기입니다(`ui/checkbox`·`ui/radio-group`
 * 과 같은 꼴). Tailwind 4 의 붙박이 변형이라 Radix 가 실제로 다는
 * `data-state="checked"` 와 `data-checked` 를 **둘 다** 잡습니다 —
 * 원본 저장소의 `data-[state=checked]:` 를 그대로 옮기면 동작은 같지만
 * 이 저장소에서 혼자 다른 표기가 됩니다.
 *
 * 폭이 여기서 정해집니다: 28px(`size-7`) × 4 + 4px(`gap-1`) × 3 = **124px**.
 */
export const COLOR_SWATCH_CELL =
  "flex size-7 items-center justify-center rounded-md p-0 [&>.absolute]:hidden data-checked:ring-2 data-checked:ring-ring";

/** 견본 4열 그리드의 폭 — 위 계산에서 나온 **124px** 입니다 */
export const COLOR_GRID_W = "w-[124px]";
