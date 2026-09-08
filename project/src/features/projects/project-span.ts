import { diffDays, isYmd } from "@/features/projects/ymd";

/**
 * 프로젝트 카드의 **기간 한 줄**과 **오늘 위치**를 만드는 순수 함수 (`DEC-075`).
 *
 * 원본(Orbee)의 `features/dashboard/project-span.ts` 를 그대로 옮긴 것이고,
 * 옮기면서 바꾼 것은 날짜 산수의 출처 하나입니다(`features/projects/ymd`).
 *
 * 🔴 **화면 밖으로 뺀 이유**는 하나입니다 — 여기가 날짜 산수를 하는 자리인데,
 *    `.tsx` 안에 두면 렌더를 세워야만 잴 수 있어 경계값(하루짜리 · 거꾸로 된
 *    기간 · 오늘 = 시작일)을 싸게 못 잽니다.
 *
 * 🔴 **`today` 를 인자로 받습니다.** 안에서 `new Date()` 를 부르면 ① 서버가 그린
 *    HTML 과 브라우저가 다시 그린 것이 자정 근처에서 갈리고 ② 시간대가 다른
 *    기기에서 하루가 밀립니다. 호출부(서버 컴포넌트)가 한 번 정해 내려보냅니다.
 */

/** 오늘이 기간의 어디쯤인가. `unset` 은 시작·끝이 둘 다 없어 잴 것이 없는 상태입니다 */
export type SpanState = "unset" | "before" | "running" | "done";

export interface ProjectSpan {
  /** 사람이 읽는 기간 문구 */
  label: string;
  /**
   * **카드 한 칸에 들어가는 짧은 꼴**(`8.27 ~ 10.22`).
   *
   * 🔴 **`label` 을 짧게 바꾸지 않고 하나를 더 낸 이유**는 쓰는 곳이 둘이기
   *    때문입니다 — 목록 카드와 상세 머리말. 상세는 폭이 남으므로 긴 꼴이 맞고,
   *    짧은 꼴이 필요한 것은 좁아지는 카드뿐입니다. 공용 함수를 짧게 고치면
   *    **상세까지 같이 바뀝니다.**
   * 🔴 **두 꼴을 한 함수가 냅니다.** 짧은 꼴을 다른 함수로 빼면 "시작만 있음 ·
   *    끝만 있음 · 둘 다 없음" 세 갈래를 두 곳에 적게 되고, 그건 한쪽만
   *    고쳐지는 자리입니다.
   */
  shortLabel: string;
  /**
   * 오늘 위치(0~100). **잴 수 없으면 `null`** 입니다 — 시작·끝 중 하나라도
   * 없거나, 끝이 시작보다 앞선 경우입니다.
   *
   * 🔴 잴 수 없을 때 `0` 을 돌려주면 화면이 「아직 시작 안 함」으로 그립니다.
   *    모르는 것과 0% 는 다른 사실이라 값으로 갈라 둡니다.
   */
  percent: number | null;
  state: SpanState;
}

/**
 * 날짜 하나를 사람이 읽는 말로.
 *
 * 🔴 **해가 다르면 연도를 붙입니다.** 프로젝트는 해를 넘기는 것이 정상이라
 *    "3월 4일 ~ 1월 20일" 이 **거꾸로 된 기간처럼** 읽힙니다.
 */
export function fmtSpanDate(iso: string, today: string): string {
  const [y, m, d] = iso.split("-");
  const sameYear = today.slice(0, 4) === y;
  return sameYear
    ? `${Number(m)}월 ${Number(d)}일`
    : `${Number(y)}년 ${Number(m)}월 ${Number(d)}일`;
}

/**
 * 같은 날짜를 **카드용 짧은 꼴**로 — `8.27`, 해가 다르면 `27.1.5`.
 *
 * 🔴 **연도를 보이는 조건은 `fmtSpanDate` 와 똑같습니다**(올해가 아니면 붙입니다).
 *    규칙이 갈리면 같은 프로젝트가 목록에서는 해를 안 보여 주고 상세에서는
 *    보여 주는 날이 옵니다.
 * 🔴 **연도는 두 자리입니다**(`2027` → `27`). 카드는 기간 한 줄에 100px 남짓만
 *    줍니다 — 네 자리로 적으면 해를 넘기는 프로젝트가 그 자리에서 잘리고,
 *    카드는 **잘린 글자를 되찾을 길이 없습니다.**
 * 🔴 **구분자가 `.` 하나입니다.** `27.1.5`(세 토막)와 `8.27`(두 토막)은 토막
 *    수로 갈리므로, 같은 줄에 섞여도 어느 쪽이 연도인지 읽힙니다.
 * ⚠️ **월·일에 0 을 안 채웁니다**(`8.27`이지 `08.27`이 아닙니다). 폭이 목적인데
 *    두 자리로 맞추면 한 달에 아홉 날은 공짜로 넓어집니다. 대신 자릿수가
 *    들쭉날쭉해 보이지 않도록 카드의 그 줄은 `tabular-nums` 입니다.
 */
export function fmtSpanDateShort(iso: string, today: string): string {
  const [y, m, d] = iso.split("-");
  const md = `${Number(m)}.${Number(d)}`;
  return today.slice(0, 4) === y ? md : `${y.slice(2)}.${md}`;
}

/**
 * 시작·끝을 한 줄로 잇습니다. **형식만 다르고 갈래는 하나**라 포매터를 받아
 * 두 번 씁니다(긴 꼴 · 짧은 꼴) — 갈래를 두 번 적으면 한쪽만 고쳐지는 날이 옵니다.
 *
 * ⚠️ 여기 오는 시점에는 `s`·`e` 중 적어도 하나가 있습니다(부르는 쪽이 먼저 걸렀습니다).
 */
function joinSpan(
  s: string | null,
  e: string | null,
  fmt: (iso: string) => string
): string {
  if (s && e) return `${fmt(s)} ~ ${fmt(e)}`;
  return s ? `${fmt(s)} ~` : `~ ${fmt(e as string)}`;
}

/**
 * 끝이 시작보다 앞선 기간인가 — **폼이 저장 전에 막습니다.**
 *
 * 저장 계층(`schema` 의 `orderedDates`)도 같은 규칙으로 거절하지만, 액션이
 * 거절하면 화면은 「입력값을 확인해 주세요」만 보여 줍니다. 어느 칸이 틀렸는지
 * 말할 수 있는 것은 폼입니다.
 *
 * 한쪽이 비면 잴 짝이 없으니 거짓입니다. 날짜는 `YYYY-MM-DD` 라 **문자열 비교가
 * 곧 날짜 비교**입니다.
 */
export function spanReversed(
  start: string | null | undefined,
  end: string | null | undefined
): boolean {
  return !!start && !!end && end < start;
}

/**
 * 시작·끝·오늘 → 카드에 그릴 기간 정보.
 *
 * ⚠️ **끝이 시작보다 앞선 경우를 던지지 않습니다.** 저장 계층이 막지만 옛
 *    데이터가 그 상태일 수 있고, 여기서 던지면 카드 하나 때문에 **목록 전체가
 *    죽습니다.** 못 잰다는 사실을 `percent: null` 로 돌려줍니다.
 */
export function projectSpan(
  start: string | null,
  end: string | null,
  today: string
): ProjectSpan {
  const s = isYmd(start) ? start : null;
  const e = isYmd(end) ? end : null;

  /* 🔴 「기간 없음」은 **짧은 꼴도 같은 글자**입니다. 여기서만 다른 낱말을 쓰면
     같은 상태가 화면마다 다른 이름을 갖게 됩니다. */
  if (!s && !e)
    return {
      label: "기간 없음",
      shortLabel: "기간 없음",
      percent: null,
      state: "unset",
    };

  const label = joinSpan(s, e, (iso) => fmtSpanDate(iso, today));
  const shortLabel = joinSpan(s, e, (iso) => fmtSpanDateShort(iso, today));

  // 한쪽만 있으면 오늘이 그 앞인지 뒤인지는 알 수 있지만 **위치(%)는 못 잽니다.**
  if (!s || !e) {
    const state: SpanState = s
      ? today < s
        ? "before"
        : "running"
      : today > (e as string)
        ? "done"
        : "running";
    return { label, shortLabel, percent: null, state };
  }

  if (e < s) return { label, shortLabel, percent: null, state: "running" };

  if (today < s) return { label, shortLabel, percent: 0, state: "before" };
  if (today > e) return { label, shortLabel, percent: 100, state: "done" };

  const total = diffDays(s, e);
  const done = diffDays(s, today);
  // 형식은 위에서 걸렀지만 없는 날짜(2026-02-30)는 통과합니다 — 그때는 못 잽니다.
  if (total === null || done === null)
    return { label, shortLabel, percent: null, state: "running" };
  // 하루짜리 프로젝트는 총 0일입니다. 나누면 0으로 나누기가 되므로 **오늘이 그날이면 100%** 입니다.
  if (total === 0) return { label, shortLabel, percent: 100, state: "running" };

  return {
    label,
    shortLabel,
    percent: Math.round((done / total) * 100),
    state: "running",
  };
}
