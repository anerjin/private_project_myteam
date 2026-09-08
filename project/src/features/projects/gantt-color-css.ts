import { GANTT_COLORS } from "@/components/reui/gantt/gantt-bar";
import type { GanttColorKey } from "@/features/projects/schema";

/**
 * 우리 색 키 → **벤더의 CSS 값** (`FR-PROJ-014` · `DEC-074`).
 *
 * **이 변환을 하는 자리는 저장소에서 여기 하나입니다.**
 *
 * ## 팔레트를 베끼지 않습니다
 *
 * 벤더가 `gantt-bar.tsx` 에서 `GANTT_COLORS` 를 내보냅니다
 * (`{ name, value }` · `value` 는 `var(--color-blue-500)` 꼴). 열 줄을 우리
 * 쪽에 옮겨 적으면 **첫날에는 똑같습니다** — 갈리는 것은 간트를 다시 받아
 * 오는 날이고 (`DEC-070`: 상류 수정은 손으로 가져옵니다), 그때 화면은
 * 「어떤 막대만 색이 이상하다」로만 보입니다. 아무도 원인을 못 찾습니다.
 * 그래서 값이 아니라 **벤더의 배열 자체**를 가져다 씁니다.
 *
 * ## 키는 벤더의 이름을 소문자로 눕힌 것입니다
 *
 * 벤더의 표기(`"Blue"`)가 바뀌어도 DB 에 남은 `"blue"` 가 안 낡게 하려는
 * 것입니다. 이름 «자체»가 바뀌면 그건 DB 가 낡는 사건이고, 그때는
 * `schema.ts` 의 키를 고쳐야 합니다 — 조용히 지나가면 안 되는 자리라
 * 원본 저장소는 여기에 테스트를 박아 두었습니다. 이 저장소에는 아직
 * 단위 테스트 도구가 없어 옮기지 못했습니다.
 *
 * ## 왜 `schema.ts` 가 아닌가
 *
 * 이 파일은 `"use client"` 인 `gantt-bar.tsx` 를 **값으로** import 하고,
 * 그 파일은 간트 9개 파일(9,902줄 · 380KB)을 통째로 끌고 옵니다.
 * `schema.ts` 는 `server-only` 인 `project-task.service` 와 폼·표가 함께
 * 읽는 모듈이라, 거기에 넣으면 프로젝트 화면 전부가 그 무게를 집니다.
 * **간트를 값으로 쓰는 파일은 `project-gantt.tsx` 와 이 파일 둘뿐입니다.**
 */
const CSS_BY_KEY: ReadonlyMap<string, string> = new Map(
  GANTT_COLORS.map((c) => [c.name.toLowerCase(), c.value])
);

/**
 * 그 키의 CSS 값. **모르는 키면 `undefined`** 입니다.
 *
 * 부르는 쪽이 `color` 칸을 **아예 안 넣어** 벤더 기본색으로 떨어지게
 * 하려는 것입니다. 여기서 우리 기본색을 대신 돌려주지 않습니다 — 벤더가
 * `event.color ?? "var(--color-primary)"` 로 그 자리를 이미 갖고 있어서,
 * 여기서 또 정하면 기본색이 두 곳이 됩니다.
 */
export function ganttColorCss(key: GanttColorKey): string | undefined {
  return CSS_BY_KEY.get(key);
}
