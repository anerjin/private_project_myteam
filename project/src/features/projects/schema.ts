import { z } from "zod";

import { YMD } from "@/features/projects/ymd";

/**
 * 프로젝트 입력 규칙 (`FR-PROJ-*` · `DEC-069` · `DEC-075`).
 *
 * **서버와 화면이 같은 값을 봅니다.** service 는 `server-only` 라 화면이 못
 * 읽습니다 — `notes/schema` 를 같은 이유로 이 자리에 둔 것과 같습니다.
 *
 * ## `DEC-075` 에서 절반이 사라졌습니다
 *
 * 프로젝트를 gboard(Orbee) 형태로 통째로 바꾸면서 **문서 구획 · 할 일 상태 ·
 * 하위 할 일 · 마일스톤 · 선후행**이 표와 함께 없어졌습니다. 그 자리에 있던
 * `SECTIONS`·`TASK_STATUS`·`projectDocSchema`·`projectTaskSchema` 도 함께
 * 지웠습니다 — 표가 없는 값의 검증기를 남겨 두면 다음 사람이 그것을 «있는
 * 기능»으로 읽습니다.
 *
 * 남은 것은 **그릇(프로젝트) · 항목 · 항목의 댓글** 셋입니다. 항목은 이름과
 * 기간과 진척률과 색과 담당자를 갖고, 그 이상을 갖지 않습니다.
 */

export const PROJECT_NAME_MAX = 100;
export const PROJECT_DESC_MAX = 300;

/**
 * 항목 이름의 상한.
 *
 * 원본(Orbee)은 프로젝트 이름과 항목 이름에 **같은 상수**를 씁니다. 우리는
 * 갈라 둡니다 — 여기 있던 `TASK_TITLE_MAX` 를 이름만 바꾼 것이고, 프로젝트
 * 이름(100)보다 넉넉한 것은 항목이 「무엇을 언제까지」를 한 줄로 적는 자리라
 * 원래 길기 때문입니다.
 */
export const ITEM_TITLE_MAX = 150;

/**
 * 댓글 본문 상한 (`DEC-074`).
 *
 * 자료 본문(10만 자)과 두 자리 다릅니다 — **댓글은 글이 아니라 말**이고,
 * 기획서 한 편이 들어갈 칸이면 아무도 그것을 댓글로 읽지 않습니다. 길게 쓸
 * 것은 자료로 쓰고 그 자료에 대해 여기서 이야기합니다.
 */
export const ITEM_COMMENT_MAX = 2_000;

/**
 * 프로젝트 상태.
 *
 * **원본에는 없는 칸입니다.** Orbee 의 프로젝트는 이름·기간 셋뿐이고 그
 * 폼에 *"설명·상태·참가자를 더하지 않는다"* 가 적혀 있습니다. 그 규율을
 * 그대로 옮기지 않은 이유는 **우리 표에 두 칸이 이미 있기 때문**입니다
 * (`projects.description`·`projects.status` — `DEC-075` 에서 남긴 칸).
 * 폼에서 빼면 그 두 칸은 아무도 채우지 않는 죽은 칸이 되고, 목록의 정렬
 * (`status asc`)도 근거를 잃습니다.
 */
export const PROJECT_STATUS = [
  { value: "PLANNED", label: "예정" },
  { value: "ACTIVE", label: "진행 중" },
  { value: "PAUSED", label: "보류" },
  { value: "DONE", label: "완료" },
] as const;

export const statusLabel = (v: string) =>
  PROJECT_STATUS.find((s) => s.value === v)?.label ?? v;

/**
 * 간트 막대 색 — **키 목록은 여기 하나입니다** (`FR-PROJ-014` · `DEC-074`).
 *
 * ## 저장하는 것은 «키» 이지 CSS 값이 아닙니다
 *
 * 베어 온 간트는 `event.color` 를 받아 **그대로** `--gantt-event-color` 에
 * 꽂습니다 (`components/reui/gantt/gantt-bar.tsx`). 즉 **DB 문자열이 CSS 로
 * 흘러갑니다.** 그래서 두 가지를 막습니다.
 *
 * 첫째, `var(--color-blue-500)` 같은 벤더의 속을 DB 에 굳히지 않습니다 —
 * 간트를 다시 받아 오는 날 (`DEC-070`: 상류 수정은 손으로 가져옵니다)
 * 저장된 값이 낡습니다. 둘째, 목록에 없는 값이 저장될 길을 없앱니다 —
 * `color` 컬럼은 `String?` 이라 DB 가 안 막아 줍니다.
 *
 * ## CSS 값은 여기 없습니다
 *
 * 키를 CSS 로 바꾸는 자리는 `features/projects/gantt-color-css.ts` 하나이고,
 * 그 파일이 벤더의 팔레트를 **그대로 가져다 씁니다.** 이 파일에 합치면
 * 안 됩니다 — 이 모듈은 `server-only` 인 `project-item.service` 와 폼·간트가
 * 함께 읽는데, 벤더 팔레트는 `"use client"` 인 `gantt-bar.tsx` 에 있고 그
 * 파일은 간트 9개 파일(9,902줄 · 380KB)을 통째로 끌고 옵니다. 합치면
 * **프로젝트 화면 전부가 간트의 무게를 집니다.**
 *
 * ## 기본값은 «안 정함» 입니다
 *
 * 벤더가 `event.color ?? "var(--color-primary)"` 로 자기 기본색을 이미
 * 갖고 있습니다. 여기서 우리 기본색을 또 정하면 기본색이 두 곳이 됩니다.
 */
export const GANTT_COLOR_KEYS = [
  "blue",
  "emerald",
  "violet",
  "rose",
  "amber",
  "cyan",
  "orange",
  "pink",
  "teal",
  "indigo",
] as const;

export type GanttColorKey = (typeof GANTT_COLOR_KEYS)[number];

/** 아는 색 키인가 — 저장 경로의 관문입니다 */
export function isGanttColorKey(v: unknown): v is GanttColorKey {
  return (
    typeof v === "string" && (GANTT_COLOR_KEYS as readonly string[]).includes(v)
  );
}

/**
 * 무엇이 들어오든 색 키이거나 `null`.
 *
 * **읽는 쪽에도 씁니다.** 컬럼이 `String?` 이라 옛 키나 손으로 넣은 값이
 * 남아 있을 수 있습니다. `as GanttColorKey` 로 통과시키면 그 값이 타입
 * 오류 없이 화면까지 가고, 거기서 그냥 빈 뱃지로 끝나지 않습니다 —
 * **CSS 커스텀 속성으로 들어갑니다.**
 */
export function toGanttColorKey(v: unknown): GanttColorKey | null {
  return isGanttColorKey(v) ? v : null;
}

/**
 * 사람이 읽는 이름 — **우리가 짓습니다** (벤더의 이름은 영어입니다).
 *
 * 화면에서 색 이름은 글자로 안 보이고 `aria-label` 로만 남습니다
 * (`project-gantt-color-picker`). 색 견본만 있는 단추는 화면 낭독기에
 * 아무것도 아닌 것이 되므로, 이름은 **사라진 것이 아니라 옮겨 간** 것입니다
 * (`NFR-A11Y-002`).
 */
export const GANTT_COLOR_LABEL: Record<GanttColorKey, string> = {
  blue: "파랑",
  emerald: "에메랄드",
  violet: "보라",
  rose: "장미",
  amber: "황금",
  cyan: "하늘",
  orange: "주황",
  pink: "분홍",
  teal: "청록",
  indigo: "남색",
};

/**
 * 날짜는 **문자열로 오고 갑니다** (`YYYY-MM-DD`).
 *
 * `Date` 로 주고받으면 브라우저가 자기 시간대로 해석해 **하루씩 밀립니다** —
 * 「9월 3일」이 2일 저녁으로 저장되는 그 문제입니다. 컬럼도 `date` 이고
 * (`DEC-069`), 경계에서 문자열로 붙잡아 둡니다.
 *
 * ⚠️ **모양(`YMD`)은 여기서 정하지 않습니다** — `features/projects/ymd` 가
 *    갖고 있고 화면도 그것을 봅니다. 검증기와 화면이 서로 다른 정규식을 보면
 *    「폼은 통과했는데 막대가 안 그려지는 날짜」가 생깁니다.
 */

/**
 * 「날짜이거나 안 정함」 한 칸.
 *
 * **`undefined` 를 «안 정함»으로 쓰지 않습니다.** 아래 `projectItemPatchSchema`
 * 가 «이 칸을 안 보냈다»(= 건드리지 마라)와 «비우겠다»를 갈라야 하는데,
 * 둘을 같은 값으로 두면 색 하나를 바꾸려다 기간이 지워집니다. 그래서
 * **비움은 언제나 `null`** 이고 빈 문자열도 여기서 `null` 이 됩니다 —
 * 폼의 빈 칸이 그렇게 옵니다.
 */
const ymdOrNull = z
  .union([z.string(), z.null()])
  .transform((v) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s === "" ? null : s;
  })
  .refine((v) => v === null || YMD.test(v), {
    message: "날짜는 YYYY-MM-DD 형식입니다.",
  });

/** 「사람이거나 미배정」 한 칸 — 위와 같은 규약(빈 문자열은 `null`) */
const userIdOrNull = z.union([z.string(), z.null()]).transform((v) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
});

/** `YYYY-MM-DD` → UTC 자정. **시간대를 타지 않게 `Z` 를 박습니다** */
export function toDate(s: string | undefined | null): Date | null {
  if (!s) return null;
  return new Date(`${s}T00:00:00.000Z`);
}

/** UTC 자정 → `YYYY-MM-DD`. `toISOString` 을 쓰면 시간대를 안 탑니다 */
export function fromDate(d: Date | null | undefined): string | undefined {
  return d ? d.toISOString().slice(0, 10) : undefined;
}

/**
 * 시작이 끝보다 뒤면 막습니다.
 *
 * **DB 가 못 막습니다** — 체크 제약을 걸 수도 있지만, 그러면 오류가
 * 「제약 위반」으로 올라와 화면이 어느 칸을 가리켜야 할지 모릅니다.
 */
const orderedDates = <
  T extends { startsOn?: string | null; endsOn?: string | null },
>(
  v: T,
  ctx: z.RefinementCtx
) => {
  if (v.startsOn && v.endsOn && v.startsOn > v.endsOn) {
    ctx.addIssue({
      code: "custom",
      path: ["endsOn"],
      message: "종료일이 시작일보다 앞설 수 없습니다.",
    });
  }
};

export const projectSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "이름을 적어 주세요.")
      .max(PROJECT_NAME_MAX, `이름은 ${PROJECT_NAME_MAX}자까지입니다.`),
    description: z.string().trim().max(PROJECT_DESC_MAX).default(""),
    status: z.enum(["PLANNED", "ACTIVE", "PAUSED", "DONE"]).default("PLANNED"),
    startsOn: ymdOrNull,
    endsOn: ymdOrNull,
  })
  .superRefine(orderedDates);

export type ProjectInput = z.infer<typeof projectSchema>;

/**
 * 기간 두 칸만 — 상세 머리말의 「기간 수정」 (`DEC-075`).
 *
 * 🔴 **`projectSchema` 를 `.pick()` 하지 않았습니다.** 저쪽은 `superRefine` 이
 *    붙은 `ZodEffects` 라 `.pick()` 이 안 되고, 억지로 벗겨 내면 **거꾸로 된
 *    기간을 막던 규칙이 함께 벗겨집니다.** 대신 같은 `orderedDates` 를 다시
 *    붙입니다 — 규칙은 하나이고 그것을 쓰는 자리가 둘입니다.
 */
export const projectSpanSchema = z
  .object({ startsOn: ymdOrNull, endsOn: ymdOrNull })
  .superRefine(orderedDates);

/**
 * ⚠️ 이름이 `…Patch` 인 것은 간트 모델의 `ProjectSpanInput`(`{ start, end }` —
 *    화면이 쓰는 모양)과 헷갈리지 않게 하려는 것입니다. 둘은 다른 값입니다:
 *    이쪽은 **저장하러 가는 값**이고 그쪽은 **그리는 데 쓰는 값**입니다.
 */
export type ProjectSpanPatch = z.infer<typeof projectSpanSchema>;

/**
 * 항목 하나를 **만들** 때의 값 (`FR-PROJ-010`).
 *
 * **칸이 전부 필수입니다** — 「안 정함」도 `null` 로 **보내야** 합니다.
 * 원본이 같은 자리에 적어 둔 이유가 그대로입니다: 색 칸을 안 보내면 저장이
 * 조용히 「안 정함」으로 떨어지는데, 화면에는 낙관적으로 이미 칠해져 있어서
 * **새로고침해야 그 실수가 보입니다.** 선택 값으로 두면 부르는 자리가 늘 때
 * 그 갈래가 되살아나므로, 컴파일이 막게 합니다.
 *
 * ⛔ **상위·마일스톤·상태 칸이 없습니다** (`DEC-075` — 표에서 사라졌습니다).
 *    되살리지 마십시오.
 */
export const projectItemSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "이름을 적어 주세요.")
      .max(ITEM_TITLE_MAX, `이름은 ${ITEM_TITLE_MAX}자까지입니다.`),
    startsOn: ymdOrNull,
    endsOn: ymdOrNull,
    progress: z.coerce.number().int().min(0).max(100),
    color: z.enum(GANTT_COLOR_KEYS).nullable(),
    assigneeId: userIdOrNull,
  })
  .superRefine(orderedDates);

export type ProjectItemInput = z.infer<typeof projectItemSchema>;

/**
 * 항목 하나를 **고칠** 때의 값 — 🔴 **보낸 칸만 바뀝니다.**
 *
 * 간트가 한 항목에 대해 하는 일이 다섯입니다(옮기기·이름·진척률·색·담당자).
 * 그때마다 항목 전체를 다시 쓰면 **색 하나 바꾸려다 기간이 지워집니다** —
 * 우클릭 메뉴는 제목도 날짜도 모르기 때문입니다. 그래서 칸이 전부 선택이고,
 * **없는 칸은 건드리지 않고 `null` 은 비웁니다.**
 *
 * 이것이 옛 `rescheduleTaskAction`·`setTaskColorAction` 둘을 대신합니다 —
 * 「날짜만 바꾸는 길」과 「색만 바꾸는 길」을 각자 액션으로 두면 담당자를 더할
 * 때 셋째가 생기고, 그 셋이 저마다 검증을 갖게 됩니다.
 */
export const projectItemPatchSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "이름을 적어 주세요.")
      .max(ITEM_TITLE_MAX, `이름은 ${ITEM_TITLE_MAX}자까지입니다.`)
      .optional(),
    startsOn: ymdOrNull.optional(),
    endsOn: ymdOrNull.optional(),
    progress: z.coerce.number().int().min(0).max(100).optional(),
    color: z.enum(GANTT_COLOR_KEYS).nullable().optional(),
    assigneeId: userIdOrNull.optional(),
  })
  .superRefine(orderedDates);

export type ProjectItemPatch = z.infer<typeof projectItemPatchSchema>;

/**
 * 항목 댓글 (`DEC-074`).
 *
 * **칸이 하나뿐입니다.** 멘션·답글·첨부가 없습니다 — 원본(gboard)도 그렇고,
 * 그 셋은 저마다 「누구에게 알리는가」·「어디까지 접히는가」·「어디에 두는가」를
 * 데리고 옵니다. 지금 필요한 것은 **항목 하나에 대해 한 줄 남기는 것**입니다.
 *
 * `trim()` 뒤에 `min(1)` — 공백만 있는 댓글은 화면에서 빈 줄로 보이는데,
 * 그것을 지울 수 있는 사람은 쓴 사람과 소유자뿐입니다.
 */
export const projectItemCommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "댓글을 적어 주세요.")
    .max(ITEM_COMMENT_MAX, `댓글은 ${ITEM_COMMENT_MAX}자까지입니다.`),
});

export type ProjectItemCommentInput = z.infer<typeof projectItemCommentSchema>;
