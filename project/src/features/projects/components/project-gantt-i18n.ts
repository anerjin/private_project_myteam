import { format, isSameYear, subMilliseconds, type Locale } from "date-fns";
import { ko } from "date-fns/locale";

import type { GanttI18nOverrides } from "@/components/reui/gantt/gantt-i18n";
import type {
  GanttDateRange,
  GanttScale,
} from "@/components/reui/gantt/gantt-types";

/**
 * 간트 한국어 (`DEC-070` · `DEC-075`).
 *
 * 🔴 ReUI 는 로케일 표를 하나도 싣고 오지 않습니다. `gantt-i18n.tsx` 에 있는
 *    것은 **영어 기본값**(`DEFAULT_LABELS`)과 빈 그릇뿐이라, 안 채우면 화면이
 *    통째로 영어가 됩니다. 이 시스템은 한국어 단일이라(`REQ-01` 1.4) 화면에
 *    나오는 것과 **읽어 주는 것**을 함께 바꿉니다 — 눈에 보이는 것만 바꾸면
 *    화면 낭독기에는 영어가 남습니다.
 *
 * 🔴 **`functions` 를 셋 덮습니다.** 벤더의 기본 구현은 포맷 문자열을 **소스에
 *    박아** 두었습니다(`formatEventTime` 은 종일 가지에서 `"MMM d, yyyy"` 를,
 *    `formatTitle` 은 분기에 `"QQQ yyyy"` 를 직접 씁니다). ko 로케일만 넣으면
 *    각각 **"8월 20, 2026"**, **"3분기 2026"** 이 됩니다 — `formats` 로는 못
 *    고칩니다.
 * ⚠️ 병합기(`mergeGanttI18n`)가 나머지 기본 구현은 그대로 두므로, 덮는 것은 이
 *    셋뿐입니다.
 *
 * 🔄 **옛 `KO` 상수를 대신합니다** (`DEC-074` 때의 어댑터). 그때는 `labels` 만
 *    덮었고 `formats`·`functions` 를 비워 두었는데, 그래서 **막대 툴팁과 상단
 *    제목이 영어 어순으로 남아 있었습니다.** 옮겨 오면서 그 둘을 메웠습니다.
 */
export const GANTT_LOCALE = ko;

/**
 * 기간 한 줄 — **언제나 「포함」으로 읽습니다.**
 *
 * 🔴 ReUI 의 `end` 는 배타적이라 8월 3일 하루짜리 막대의 끝은 8월 4일 0시입니다.
 *    그대로 적으면 사용자는 **하루 더 긴 기간**을 읽습니다. 그래서 마지막
 *    순간(끝 − 1ms)의 날짜를 씁니다 — `project-gantt-model.ts` 의 `fromBarRange`
 *    와 같은 규약입니다.
 *
 * ⚠️ **`allDay` 를 보지 않습니다.** 이 화면의 모든 것이 날짜 단위입니다(막대는
 *    종일이고, 빈 트랙 드래그가 만드는 초안은 `allDay: false` 지만 하루 단위로
 *    스냅됩니다 — `slotDuration`). 두 갈래로 적으면 같은 기간이 자리에 따라
 *    다르게 읽힙니다.
 */
function dayRangeLabel(start: Date, end: Date, locale?: Locale): string {
  const opts = { locale };
  const last =
    end.getTime() - 1 >= start.getTime() ? subMilliseconds(end, 1) : start;
  if (format(start, "yyyy-MM-dd") === format(last, "yyyy-MM-dd")) {
    return format(start, "yyyy년 M월 d일", opts);
  }
  if (isSameYear(start, last)) {
    return `${format(start, "yyyy년 M월 d일", opts)} ~ ${format(last, "M월 d일", opts)}`;
  }
  return `${format(start, "yyyy년 M월 d일", opts)} ~ ${format(last, "yyyy년 M월 d일", opts)}`;
}

/** 내비게이션 제목. 스케일마다 한국어 어순이 달라 한 자리에 모아 둡니다 */
function titleFor(
  scale: GanttScale,
  ctx: { date: Date; activeRange: GanttDateRange; locale?: Locale }
): string {
  const opts = { locale: ctx.locale };
  if (scale === "day") return format(ctx.date, "yyyy년 M월 d일 EEEE", opts);
  if (scale === "month") return format(ctx.date, "yyyy년 M월", opts);
  // `Q` 는 분기 번호 토큰입니다. 한글은 date-fns 의 토큰 문자(a-zA-Z)가 아니라 그대로 남습니다.
  if (scale === "quarter") return format(ctx.date, "yyyy년 Q분기", opts);
  if (scale === "year") return format(ctx.date, "yyyy년", opts);
  return dayRangeLabel(ctx.activeRange.start, ctx.activeRange.end, ctx.locale);
}

export const GANTT_I18N: GanttI18nOverrides = {
  labels: {
    today: "오늘",
    previous: "이전",
    next: "다음",
    addEvent: "항목 추가",
    addTask: "항목 추가",
    allDay: "종일",
    loading: "불러오는 중…",
    event: "항목",
    events: (count) => `항목 ${count}개`,
    week: (weekNumber) => `${weekNumber}주차`,
    resources: "항목",
    goToDate: "날짜로 이동",
    scheduleHint: "눌러서 항목 추가",
    scheduleHintDrag: "끌어서 기간을 정하세요",
    reorder: "순서 바꾸기",
    selectView: "기간 단위",
    zoomIn: "확대",
    zoomOut: "축소",
    resizePanel: "칸 너비 조절",
    jumpToBar: (title) => `「${title}」로 이동`,
    progress: (percent) => `진척률 ${percent}%`,
    durationDays: (days) => `${days}일`,
    continues: "계속됨",
    planned: (rangeLabel) => `계획 ${rangeLabel}`,
    milestone: "마일스톤",
    scales: {
      // "일" 은 이 화면의 전환 목록에 안 나옵니다(`PROJECT_SCALES`). 그래도 채워
      // 두는 이유는, 비우면 벤더 기본값(영어)이 남기 때문입니다.
      day: "일",
      week: "주",
      month: "월",
      quarter: "분기",
      year: "년",
    },
  },
  formats: {
    // 🔴 기본값 `"MMMM yyyy"` 는 ko 로케일에서 **"8월 2026"** 이 됩니다 —
    //    한국어는 자리 순서 자체가 다릅니다.
    monthTitle: "yyyy년 M월",
    dayTitle: "yyyy년 M월 d일 EEEE",
    timeGutter: "H시",
    eventTime: "M월 d일",
  },
  functions: {
    formatTitle: (scale, ctx) => titleFor(scale, ctx),
    formatEventTime: (start, end, _allDay, locale) =>
      dayRangeLabel(start, end, locale),
    formatDayRange: (range, locale) =>
      dayRangeLabel(range.start, range.end, locale),
  },
};
