import type {
  GanttEvent,
  GanttNode,
  GanttScale,
} from "@/components/reui/gantt/gantt-types";
import { ganttColorCss } from "@/features/projects/gantt-color-css";
import type { GanttColorKey } from "@/features/projects/schema";
import {
  addDays,
  atUtcMidnight,
  diffDays,
  isYmd,
  toYmd,
} from "@/features/projects/ymd";

/**
 * 프로젝트 항목 ↔ ReUI 간트 변환과, 간트가 **우리에게 물어보는 판정**들 (`DEC-075`).
 *
 * 원본(Orbee)의 `features/dashboard/projects/project-gantt-model.ts` 를 옮긴
 * 것입니다. 옮기면서 바꾼 것과 **버린 것**은 아래에 따로 적었습니다.
 *
 * 🔴 **화면 밖으로 뺀 이유**: 여기가 날짜 산수를 하는 자리인데 `.tsx` 안에 두면
 *    렌더를 세워야만 잴 수 있어, 경계값(하루짜리 항목 · 거꾸로 된 프로젝트
 *    기간 · 기간이 아예 없는 프로젝트)을 싸게 못 잽니다.
 *
 * 🔴 **시간대 변환기를 새로 만들지 않습니다.** 우리 날짜는 전부 UTC 자정이고
 *    (`features/projects/ymd` 머리말), 간트도 `timeZone="UTC"` 로 돕니다.
 *    원본은 표시 시간대를 쓰는데 그쪽에는 같은 규약을 공유하는 캘린더가 함께
 *    있어서고, 우리에게는 없습니다.
 *
 * ## ⛔ **기간 축(`axisRange`)을 안 가져왔습니다** — 이 포팅에서 유일하게 버린 기능
 *
 * 원본은 *"시작일이 이 차트의 처음이어야 한다"* 를 위해 **벤더에 `axisRange`
 * 옵션을 더했습니다.** 벤더의 축은 언제나 달력 단위 하나(주·월·분기·연)라 임의
 * 구간을 받는 길이 없기 때문입니다. 그쪽은 재벤더링 스크립트의 치환 규칙으로
 * 그 패치를 얹습니다.
 *
 * **우리는 그 길이 없습니다.** `components/reui/gantt/**` 는 베어 온 코드이고
 * (`DEC-070`) 손대지 않기로 되어 있으며, 우리에게는 패치를 다시 얹어 줄
 * 벤더링 스크립트도 없습니다 — 한 줄 고쳐 두면 다음에 간트를 다시 받아 오는 날
 * 그 수정이 조용히 사라지고, 그때 증상은 「어떤 프로젝트만 축이 이상하다」입니다.
 *
 * 그래서 **축은 벤더의 달력 축 그대로**이고, 함께 뜻을 잃는 것들도 안 가져왔습니다:
 * `ganttAxisSpan` · `ganttAxisRange` · `ganttMetricsFor` · `ganttDayRem` ·
 * `GANTT_AXIS_MAX_DAYS`. 대신 **이동 경계**(`ganttRangeBounds`)는 그대로
 * 살립니다 — 그건 벤더가 원래 갖고 있는 `rangeBounds` 라 패치가 필요 없고,
 * 축을 못 묶는 대신 화면이 몇 해씩 굴러가는 것만은 막아 줍니다.
 */

/** 하루(분). 간트의 스냅 단위를 **하루**로 못 박는 데 씁니다 — `snapDuration` 참고 */
export const DAY_MINUTES = 24 * 60;

/**
 * 사람이 찍는 진척률 눈금.
 *
 * ⛔ **날짜 기준 자동 계산을 하지 않습니다.** 기간 중 오늘 위치는 손이 안 가지만
 *    *"일이 되고 있다"* 를 뜻하지 않아 사람을 속입니다. 카드의 「오늘 위치」
 *    (`project-span.ts`)와는 **다른 값**이고, 섞으면 숫자가 거짓말합니다.
 */
export const PROGRESS_STEPS = [0, 25, 50, 75, 100] as const;

/**
 * 트리 맨 아래에 늘 있는 **빈 트랙 한 줄**의 id.
 *
 * 🔴 이 줄이 없으면 *"빈 화면 → 만들기 → 바로 간트 → 빈 트랙을 드래그"* 의
 *    마지막 칸이 성립하지 않습니다. 항목이 0개면 트리에 줄이 하나도 없어
 *    **끌 자리 자체가 없기 때문**입니다.
 * ⚠️ 항목 id 와 절대 겹치면 안 됩니다 — 우리 항목 id 는 `cuid` 입니다.
 */
export const NEW_ITEM_ROW = "__new-item-row__";

/**
 * 이름 없이 만든 항목의 **기본 이름**.
 *
 * 🔴 **빈 줄의 이름과 갈라져 있습니다.** 예전 원본에서는 한 상수가 두 일을
 *    했고, 그것이 곧 사용자가 신고한 것이었습니다 — *"항목처럼 생겼는데
 *    항목이 아닌 것"*. 빈 줄은 자기가 **하는 일**(`ADD_ITEM_LABEL`)을 이름으로
 *    쓰고, 이 상수는 *"이름을 안 적고 만든 항목"* 하나만 맡습니다.
 * ⚠️ 지금 실제로 쓰이는 자리는 **미리보기 막대** 하나입니다(폼이 빈 이름을
 *    거절하므로 저장 경로에는 안 옵니다) — 거기는 아직 이름을 적는 중이라
 *    빈 것이 정상입니다.
 */
export const NEW_ITEM_TITLE = "새 항목";

/**
 * 트리 맨 아래 빈 줄의 이름이자 **툴바 버튼의 이름**.
 *
 * 🔴 **모델이 갖습니다.** 이 문자열을 쓰는 곳이 셋입니다 — 빈 줄의 이름(여기) ·
 *    툴바 버튼 · 빈 상태 문구. 화면에 두면 모델이 그것을 import 할 수 없어
 *    (순환) 빈 줄만 옛 이름으로 남는데, 그 증상은 *"버튼과 줄의 이름이 다르다"*
 *    라 아무 검사도 안 빨개집니다.
 * ⚠️ 이름이 **하는 일**이지 항목의 이름이 아닙니다.
 */
export const ADD_ITEM_LABEL = "항목 추가";

/**
 * 「항목 추가」 대화가 떠 있는 동안 보이는 **미리보기** 줄의 id.
 *
 * 🔴 **항목이 아닙니다.** 드래그로 만들 때 «먼저 묻고 확인해야 만든다»로
 *    뒤집으면 대화가 떠 있는 동안 화면에 아무것도 안 남는데, 그게 드래그
 *    생성이 노리던 즉각적인 피드백입니다. 그래서 **놓은 자리에 막대 하나를
 *    남기고**, 취소하면 이 줄이 통째로 사라집니다.
 * ⚠️ 항목 id 와 절대 겹치면 안 됩니다 — `NEW_ITEM_ROW` 와 같은 근거입니다.
 */
export const PREVIEW_ROW = "__preview-row__";

/**
 * 아직 만들어지지 않은 항목 하나 — 대화의 **지금 값**이 그대로 옵니다.
 *
 * ⚠️ 기간이 양쪽 다 있을 때만 만들어집니다(막대를 그릴 수 없으면 미리보기도 없습니다).
 */
export interface GanttPreview {
  title: string;
  start: string;
  end: string;
  color: GanttColorKey | null;
}

/** 화면이 다루는 항목 하나. 서버 컴포넌트가 service 결과에서 만들어 넘깁니다 */
export interface ProjectItemCard {
  id: string;
  title: string;
  /** YYYY-MM-DD(**포함**) 또는 null(아직 안 정함) */
  start: string | null;
  end: string | null;
  /** 0~100. 사람이 적습니다 */
  progress: number;
  /**
   * 막대 색 — **우리 키**이거나 `null`(안 정함).
   *
   * 🔴 **필수입니다.** 선택으로 두면 «안 넘긴 자리»가 조용히 `null` 이 되고,
   *    그 화면은 색을 골랐는데도 안 골랐다고 말합니다 — 넘기는 자리가 늘 때
   *    컴파일이 막게 합니다.
   * 🔴 **CSS 값이 아닙니다.** CSS 로 바꾸는 것은 아래 `toGanttEvents` 한 곳입니다.
   */
  color: GanttColorKey | null;
  /**
   * 이 항목에 달린 **댓글 수** (`DEC-074`).
   *
   * 🔴 **본문이 아니라 수만 옵니다.** 항목마다 댓글을 통째로 실어 보내면 상세
   *    한 장이 그 무게를 전부 지는데 실제로 열어 보는 항목은 하나입니다 —
   *    본문은 대화를 열 때 서버 액션으로 옵니다.
   * 🔴 **필수입니다** — `color` 와 같은 근거입니다.
   */
  commentCount: number;
  /**
   * 담당자 id 또는 `null`(미배정).
   *
   * 🔴 **이름이 아니라 id 만 옵니다.** 그리는 것은 사람 목록과 맞춰 보는 전용
   *    컴포넌트입니다(`project-item-assignee.tsx`) — 항목마다 이름을 실으면
   *    같은 사람이 항목 수만큼 복제되고, 이름이 바뀌는 날 한쪽만 낡습니다.
   * 🔴 **필수입니다** — 위 둘과 같은 근거입니다.
   */
  assigneeId: string | null;
}

/* ── 아직 저장되지 않은 항목의 id ─────────────────────────────────────────
   🔴 **원본(Orbee)과 갈리는 자리입니다.** 그쪽은 화면이 `crypto.randomUUID()`
      로 id 를 **먼저 정해** 서버에 함께 보냅니다(오프라인 우선 저장소의 규약).
      우리는 서버가 `cuid` 를 발급합니다 — 클라이언트가 정한 id 는 곧 «사용자가
      보낸 값»이고, 그 길을 열면 남의 id 를 지어내 보내는 갈래가 함께 열립니다.

   그 대가로 **저장이 끝나기 전까지 줄에 진짜 id 가 없는 한순간**이 생깁니다.
   낙관적 갱신은 그대로 하되(막대는 즉시 그려집니다) 그 한순간에 온 조작은
   서버로 안 보냅니다 — 보내면 «찾을 수 없습니다» 토스트가 뜨고, 사람은 방금
   만든 항목이 사라진 줄 압니다.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * 🔴 **저장될 수 없는 모양이어야 합니다.** `cuid` 는 `c` 로 시작하는 영숫자라
 *    이 접두사와 절대 겹치지 않습니다 — 「안 정함」 색이 `__none__` 인 것과 같은
 *    규율입니다.
 */
const TEMP_ID_PREFIX = "__unsaved-";

/** 낙관적으로 그릴 줄에 붙일 임시 id */
export function newTempId(): string {
  return `${TEMP_ID_PREFIX}${crypto.randomUUID()}`;
}

/**
 * 서버가 아는 항목인가 — **바꾸는 조작이 전부 이것을 먼저 봅니다.**
 *
 * 판정을 여기 한 곳에 둔 것은, 화면의 여섯 자리(옮기기·이름·진척률·색·담당자·
 * 삭제)가 각자 `startsWith` 를 적으면 하나를 빠뜨리는 날이 오고 그 하나가
 * 곧 «가끔 나는 404» 이기 때문입니다.
 */
export function isSaved(id: string): boolean {
  return !id.startsWith(TEMP_ID_PREFIX);
}

/** 항목의 기간(YMD, 양끝 포함) */
export interface DaySpan {
  start: string;
  end: string;
}

/**
 * YMD 한 쌍(**포함**) → 간트가 읽는 순간 한 쌍(**end 는 배타적**).
 *
 * 🔴 `+1일` 이 이 파일에서 가장 위험한 한 줄입니다. ReUI 의 `end` 는 배타적이라
 *    (`gantt-types.tsx`: *"`end` is exclusive"*) 8월 3일 하루짜리 항목의 끝은
 *    **8월 4일 0시**입니다. 안 더하면 막대가 길이 0이 되어 화면에서 사라집니다.
 *    아래 `fromBarRange` 의 역산과 정확히 짝이고, **한쪽만 고치면 하루가 밀립니다.**
 */
export function toBarRange(span: DaySpan): { start: Date; end: Date } {
  return {
    start: atUtcMidnight(span.start),
    // 끝 다음 날 0시. 날짜 문자열 산수는 `features/projects/ymd` 가 UTC 로 못 박아 두었습니다.
    end: atUtcMidnight(addDays(span.end, 1)),
  };
}

/**
 * 간트가 준 순간 한 쌍 → YMD 한 쌍(**포함**).
 *
 * 🔴 **끝에서 1밀리초를 뺀 순간의 날짜**를 씁니다. `-1일` 로 빼면 끝이 정확히
 *    자정일 때만 맞는데, 스냅이 하루가 아닌 상태(스케일을 바꾸거나 벤더
 *    기본값으로 돌아가는 순간)에서는 자정이 아닌 끝이 들어올 수 있고 그때
 *    하루가 조용히 밀립니다.
 * ⚠️ 길이가 0 이하인 막대는 **시작한 날 하루**로 봅니다 — 저장 규약에 빈 기간이
 *    없습니다.
 */
export function fromBarRange(start: Date, end: Date): DaySpan {
  const startDay = toYmd(start);
  const endDay = toYmd(new Date(end.getTime() - 1));
  return { start: startDay, end: endDay < startDay ? startDay : endDay };
}

/** 항목의 기간. 한쪽이라도 비어 있으면 **막대를 그릴 수 없습니다**(null) */
export function itemSpan(item: ProjectItemCard): DaySpan | null {
  if (!isYmd(item.start) || !isYmd(item.end)) return null;
  return item.end < item.start
    ? // 거꾸로 저장된 항목은 **시작일 하루**로 그립니다. 던지면 화면 전체가 죽습니다
      // (`project-span.ts` 가 카드에서 내린 것과 같은 판단).
      { start: item.start, end: item.start }
    : { start: item.start, end: item.end };
}

/**
 * 트리의 줄들 — 항목 하나가 한 줄이고, 맨 아래에 **빈 트랙 한 줄**이 붙습니다.
 *
 * ⛔ **계층이 없습니다** (`DEC-075` — `parentId` 가 표에서 사라졌습니다).
 *    `children` 을 넣지 않으므로 그룹 행·롤업·접기가 통째로 안 생깁니다.
 *    되살리지 마십시오.
 *
 * 🔴 **`canCreate` 가 거짓이면 그 빈 줄을 안 붙입니다.** 그 줄이 하는 일이
 *    *"여기를 끌면 항목이 생깁니다"* 하나뿐이라, 드래그가 꺼진 폭에서는
 *    **아무 일도 안 하는 약속**만 남습니다 — 깨진 어포던스입니다. 화면이
 *    `useDragEnabled()` 를 그대로 넘겨, 제스처와 힌트가 **같은 값**에서 갈립니다.
 *
 * 🔄 **미리보기 줄이 그 앞에 낍니다.** 자리가 **항목들의 맨 뒤**인 것이
 *    중요합니다 — 확인하면 그 자리에 진짜 항목이 붙으므로(새 항목이 목록 끝에
 *    붙습니다) 막대가 안 튑니다.
 */
export function toGanttNodes(
  items: ProjectItemCard[],
  canCreate = true,
  preview: GanttPreview | null = null
): GanttNode[] {
  const rows: GanttNode[] = items.map((item) => ({
    id: item.id,
    title: item.title,
  }));
  if (preview !== null) rows.push({ id: PREVIEW_ROW, title: preview.title });
  return canCreate
    ? [...rows, { id: NEW_ITEM_ROW, title: ADD_ITEM_LABEL }]
    : rows;
}

/**
 * 막대들. **기간이 없는 항목은 막대가 없습니다** — 줄은 있고 트랙이 비어 있어,
 * 그 줄을 끌면 기간이 정해집니다(`canSelectSlot` 참고).
 *
 * `data` 에 항목 id 를 담아 둡니다. 콜백은 `GanttEvent` 를 주는데 거기서 우리
 * 항목으로 되돌아오는 길이 필요하고, id 를 그대로 쓰면 그 규약이 **암묵**이 됩니다.
 *
 * 🎨 **색을 CSS 로 바꾸는 자리가 여기입니다.** 저장은 우리 키(`"blue"`)이고
 *    벤더는 `event.color` 를 `--gantt-event-color` 커스텀 속성에 그대로 꽂습니다
 *    (`gantt-bar.tsx`) — 그래서 값을 바꿔 주는 것은 **그리는 순간**뿐입니다.
 *
 * 🔴 **색이 없으면 `color` 칸 자체를 안 넣습니다.** `color: undefined` 를 넣는
 *    것과 다릅니다: 벤더가 `event.color ?? "var(--color-primary)"` 로 자기
 *    기본색을 이미 갖고 있으므로 **우리가 기본색을 또 정하면 그 값이 두 곳**이
 *    됩니다.
 * ⚠️ 모르는 키(벤더가 팔레트에서 뺀 색)도 같은 갈래로 떨어집니다 — 던지면 화면
 *    전체가 죽고, `undefined` 를 그대로 꽂으면 CSS 가 `undefined` 라는 글자를
 *    받습니다.
 */
export function toGanttEvents(
  items: ProjectItemCard[],
  preview: GanttPreview | null = null
): GanttEvent<string>[] {
  const out: GanttEvent<string>[] = [];
  for (const item of items) {
    const span = itemSpan(item);
    if (!span) continue;
    const { start, end } = toBarRange(span);
    const css = item.color === null ? undefined : ganttColorCss(item.color);
    out.push({
      id: item.id,
      title: item.title,
      start,
      end,
      allDay: true,
      progress: item.progress,
      resourceId: item.id,
      data: item.id,
      ...(css === undefined ? {} : { color: css }),
    });
  }
  if (preview !== null) {
    const { start, end } = toBarRange({
      start: preview.start,
      end: preview.end,
    });
    const css =
      preview.color === null ? undefined : ganttColorCss(preview.color);
    out.push({
      id: PREVIEW_ROW,
      title: preview.title,
      start,
      end,
      allDay: true,
      progress: 0,
      resourceId: PREVIEW_ROW,
      /* 🔴 **`data` 를 안 넣습니다.** 이 한 칸이 *"아직 항목이 아니다"* 의
         전부입니다 — 화면의 콜백들은 전부 `occurrence.event.data` 로 항목을
         되찾는데(`handleEventUpdate`·`renderEventMenu`·`openRename`), 없으면
         그 자리에서 되돌아갑니다. 즉 미리보기 막대는 끌 수도, 메뉴를 열 수도,
         이름을 고칠 수도 없습니다. */
      ...(css === undefined ? {} : { color: css }),
    });
  }
  return out;
}

/** 프로젝트 기간 — **없을 수 있습니다**(`starts_on`·`ends_on` 이 nullable 입니다) */
export interface ProjectSpanInput {
  start: string | null;
  end: string | null;
}

/**
 * 🔴 **항목이 프로젝트 기간 밖으로 나가는가.**
 *
 * 규칙은 셋뿐입니다:
 *
 *   ① 프로젝트에 **시작이 없으면** 앞쪽을 막지 않습니다.
 *   ② **끝이 없으면** 뒤쪽을 막지 않습니다.
 *   ③ 🔴 **둘 다 없으면 아무것도 막지 않습니다** — *없는 제약을 만들지 않습니다.*
 *
 * ⚠️ 그리고 **거꾸로 된 기간(`end < start`)도 막지 않습니다.** 옛 데이터가 그
 *    상태일 수 있고, 그대로 재면 **어떤 자리도 유효하지 않아 간트가 통째로
 *    얼어붙습니다** — 못 잰다는 사실이 "전부 금지" 로 바뀌면 안 됩니다.
 *    (`project-span.ts` 가 같은 조합에서 `percent: null` 을 돌려주는 것과 같은
 *    판단입니다.)
 */
export function outsideProjectSpan(
  project: ProjectSpanInput,
  span: DaySpan
): boolean {
  const from = isYmd(project.start) ? project.start : null;
  const to = isYmd(project.end) ? project.end : null;
  if (from !== null && to !== null && to < from) return false;
  if (from !== null && span.start < from) return true;
  if (to !== null && span.end > to) return true;
  return false;
}

/**
 * 우리가 여는 스케일 넷.
 *
 * 🔴 **`"day"` 를 뺐습니다.** ReUI 의 `"day"` 는 *하루짜리 창*이고 축의 눈금이
 *    **시각**입니다(`gantt-lib.tsx` — `start = startOfDay(zoned); end =
 *    addDays(start, 1)`, 그리고 `gantt-view.tsx` 가 그 스케일에서만 스냅을
 *    `snapDuration` 분으로 바꿉니다). 항목의 저장 단위가 **날짜**인 화면에서 그
 *    창은 막대를 하나도 온전히 못 보여 줍니다. **주**가 가장 짧은 스케일입니다
 *    (주 스케일의 눈금이 곧 하루입니다).
 */
export const PROJECT_SCALES: GanttScale[] = [
  "week",
  "month",
  "quarter",
  "year",
];

/**
 * 🔴 **기간에 «기간 밖 막대»를 더한 YMD 한 쌍** — 이동 경계가 이것을 씁니다.
 *
 * 규칙:
 *   ① 양쪽 다 없으면 아무것도 없습니다(없는 제약을 만들지 않습니다).
 *   ② 거꾸로 된 기간(`end < start`)도 아무것도 없습니다 — 재면 min > max 라
 *      어디로도 못 갑니다.
 *   ③ 🔴 **밖에 있는 막대만큼 넓힙니다.** 기간을 줄이면 이미 그 밖에 있는 막대가
 *      생기는데, 경계를 기간에 딱 맞추면 그 막대는 **닿을 수 없게 됩니다**
 *      (화면 밖이고 그리로 이동도 못 합니다). 항목을 지우지도 옮기지도 않기로
 *      했으므로 남는 길은 **보이게 두는 것**뿐입니다.
 *   ⚠️ 넓히는 것은 데이터가 밖에 있을 때뿐입니다. 전부 안에 있으면 기간 그대로입니다.
 *
 * 🔴 **한쪽만 있으면 그쪽만** 넓힙니다 — 없는 쪽은 `null` 로 남습니다(벤더의
 *    `rangeBounds` 가 각 변을 선택으로 받습니다).
 *
 * ⚠️ 원본에서는 이 함수를 **축**(`ganttAxisSpan`)도 함께 썼습니다. 우리는 축을
 *    안 가져왔으므로(파일 머리말) 지금 소비자는 아래 `ganttRangeBounds` 하나입니다.
 *    그래도 함수로 남긴 것은 규칙 셋이 화면에 흩어지지 않게 하기 위해서입니다.
 */
function spanWithOutliers(
  project: ProjectSpanInput,
  items: ProjectItemCard[]
): { from: string | null; to: string | null } | null {
  let from = isYmd(project.start) ? project.start : null;
  let to = isYmd(project.end) ? project.end : null;
  if (from === null && to === null) return null;
  if (from !== null && to !== null && to < from) return null;

  for (const item of items) {
    const span = itemSpan(item);
    if (span === null) continue;
    if (from !== null && span.start < from) from = span.start;
    if (to !== null && span.end > to) to = span.end;
  }
  return { from, to };
}

/**
 * 📱 **좁은 컨테이너에서 트리 이름 칸의 폭.**
 *
 * 벤더는 컨테이너가 좁으면 트리 패널을 스스로 줄이는데 **그때는
 * `onWidthChange` 를 안 부릅니다**(`gantt-view.tsx`). 이름 칸은 우리가
 * `nameColumnWidth` 로 넘기는 값이라 288 에 남고, 그래서 폰(390px)에서는
 * 189px 짜리 패널 안에 288px 이름 칸이 들어가 **⋯ 가 패널 밖으로 밀려 이름
 * 칸을 먹는 것처럼 보입니다.** 벤더의 그 계산을 **같은 숫자로** 여기서 한 번
 * 더 합니다:
 *
 *     ceiling = container − 최소 타임라인(200) − 1(스플리터)
 *     floor   = min(트리 최소 폭(180), max(ceiling, 0))
 *     width   = max(min(원하는 폭, ceiling), min(floor, container − 1))
 *
 * 🔴 두 상수는 **벤더 기본값**입니다(`MIN_TIMELINE_WIDTH = 200` ·
 *    `DEFAULT_TREE_PANEL.minWidth = 180`). 갈리면 이름 칸이 패널보다 넓거나
 *    좁아지고, 그 증상은 화면에서만 보입니다 — 벤더를 다시 받아 오는 날
 *    (`DEC-070`) 여기를 함께 봐야 합니다.
 * ⚠️ `container` 가 0 이면(아직 못 쟀습니다) **원하는 폭 그대로**입니다 —
 *    잘못 재서 0 으로 만드는 것보다 넓은 쪽이 안전합니다.
 */
export const GANTT_MIN_TIMELINE_PX = 200;
export const GANTT_TREE_MIN_PX = 180;

export function ganttNameColumnWidth(
  treeWidth: number,
  containerWidth: number
): number {
  if (containerWidth <= 0) return treeWidth;
  const ceiling = containerWidth - GANTT_MIN_TIMELINE_PX - 1;
  const floor = Math.min(GANTT_TREE_MIN_PX, Math.max(ceiling, 0));
  return Math.max(
    Math.min(treeWidth, ceiling),
    Math.min(floor, containerWidth - 1)
  );
}

/**
 * 프로젝트 길이에서 정하는 **기본 스케일**.
 *
 * ⚠️ **기간이 없으면 기본값 하나로 갑니다.**
 * ⚠️ 원본에는 이 위에 «기간 축이면 날짜 칸 둘 중 하나» 갈래가 하나 더 있습니다.
 *    우리는 축을 안 가져왔으므로(파일 머리말) **달력 축 사다리만** 남습니다 —
 *    그 갈래를 흉내 내려고 여기에 숫자를 하나 더 만들지 않았습니다.
 */
export function ganttScaleFor(project: ProjectSpanInput): GanttScale {
  if (!isYmd(project.start) || !isYmd(project.end)) return "month";
  const days = (diffDays(project.start, project.end) ?? 0) + 1; // 양끝 포함
  if (days <= 0) return "month"; // 거꾸로 된 기간 — 잴 수 없습니다
  if (days <= 14) return "week";
  if (days <= 92) return "month";
  if (days <= 366) return "quarter";
  return "year";
}

/**
 * 처음 여는 자리(YMD).
 *
 * 오늘이 기간 안이면 **오늘**입니다(그래야 오늘 선이 보입니다). 기간 앞이면
 * 시작일, 뒤면 끝일 — 지난 프로젝트를 열었을 때 아무것도 없는 창이 뜨지 않게 합니다.
 */
export function ganttAnchorFor(
  project: ProjectSpanInput,
  today: string
): string {
  const from = isYmd(project.start) ? project.start : null;
  const to = isYmd(project.end) ? project.end : null;
  if (from !== null && today < from) return from;
  if (to !== null && today > to) return to;
  return today;
}

/**
 * 🔴 **간트가 돌아다닐 수 있는 범위.**
 *
 * 벤더에 `rangeBounds?: { min?: Date; max?: Date }` 가 있고, 안 넘기면 무한이라
 * 프로젝트가 8월 한 달이어도 화면이 2031년까지 굴러갑니다. 값을 넘기면 벤더가
 * 두 자리에서 씁니다: 이동의 기준 날짜를 자르고(`clampToBounds`), 무한 스크롤의
 * 범위 확장을 거절합니다(`extendRange`).
 *
 * 🔴 **우리에게는 이것이 화면을 붙드는 유일한 수단입니다.** 원본은 축까지 기간에
 *    묶어 두므로 이 값이 하는 일이 적지만, 우리는 축을 안 가져왔습니다
 *    (파일 머리말) — 여기가 빠지면 «한 달짜리 프로젝트를 열었는데 빈 격자만
 *    몇 해»가 그대로 돌아옵니다.
 *
 * 🔴 **양끝 다 그날 0시입니다.** 끝을 «다음 날 0시»(막대의 배타적 끝)로 잡으면
 *    기준 날짜가 기간 **다음 날**까지 갈 수 있어 프로젝트가 안 걸친 한 칸이
 *    열립니다. 경계는 막대의 좌표가 아니라 **이동의 기준 날짜**에 걸리는
 *    값입니다(`clampToBounds`).
 */
export function ganttRangeBounds(
  project: ProjectSpanInput,
  items: ProjectItemCard[]
): { min?: Date; max?: Date } | undefined {
  const bound = spanWithOutliers(project, items);
  if (bound === null) return undefined;

  const bounds: { min?: Date; max?: Date } = {};
  if (bound.from !== null) bounds.min = atUtcMidnight(bound.from);
  if (bound.to !== null) bounds.max = atUtcMidnight(bound.to);
  return bounds;
}

/* ── 낙관적 갱신의 되돌리기 ────────────────────────────────────────────────
   🔴 **`setItems(before)` 로 통째로 되돌리면 그 사이에 성공한 다른 저장까지
      지웁니다.** 막대 A 를 끌고(저장 중) 곧바로 B 를 끌었을 때 A 가 실패하면,
      `before` 에는 B 의 새 자리가 없습니다 — B 는 서버에 저장됐는데 화면은 옛
      자리로 돌아가고, 다음 새로고침에 다시 튑니다. 화면에는 아무 오류도 없습니다.
      그래서 **이 저장이 건드린 항목만** 되돌립니다.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * 실패한 저장 하나를 **지금 목록**에서 되돌립니다.
 *
 * `before`/`next` 는 그 저장이 본 목록과 만든 목록입니다. 둘을 맞대 **그 저장이
 * 만들거나 바꾼 항목**만 고르고, 그것들만 `before` 의 값으로 돌리거나(바꾼 것)
 * 지웁니다(만든 것). 그 밖의 항목은 `current` 그대로입니다 — 뒤에 성공한 저장의
 * 결과가 거기 있습니다.
 *
 * ⚠️ **참조 비교**(`!==`)입니다. 이 화면의 저장은 전부 항목 객체를 새로
 *    만들므로(`{ ...i, … }`) 바뀐 항목은 참조가 다르고, 안 바뀐 항목은 같은
 *    참조가 `next` 에 그대로 실립니다.
 * ⚠️ 같은 항목을 **연달아** 두 번 저장하고 앞의 것이 실패하면 뒤의 성공까지 함께
 *    돌아갑니다 — 한 항목의 두 변경을 가를 정보가 없습니다. 다른 항목은 건드리지
 *    않는 것이 이 함수의 전부입니다.
 * ⚠️ 이 저장이 **지운** 항목(지금 부르는 길은 없습니다)은 목록 끝에 되살립니다 —
 *    원래 자리는 모릅니다.
 */
export function revertSave(
  current: ProjectItemCard[],
  before: ProjectItemCard[],
  next: ProjectItemCard[]
): ProjectItemCard[] {
  const wasBefore = new Map(before.map((i) => [i.id, i]));
  const inNext = new Map(next.map((i) => [i.id, i]));
  const touched = new Set<string>();
  for (const [id, b] of wasBefore) if (inNext.get(id) !== b) touched.add(id);
  for (const id of inNext.keys()) if (!wasBefore.has(id)) touched.add(id);

  const out: ProjectItemCard[] = [];
  for (const i of current) {
    if (!touched.has(i.id)) {
      out.push(i);
      continue;
    }
    const b = wasBefore.get(i.id);
    if (b !== undefined) out.push(b); // 바꾼 것 → 이전 값. 만든 것은 여기서 빠집니다.
  }
  for (const [id, b] of wasBefore) {
    if (touched.has(id) && !current.some((i) => i.id === id)) out.push(b); // 지운 것 → 되살립니다
  }
  return out;
}
