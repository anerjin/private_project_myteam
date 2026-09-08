/**
 * 날짜 문자열(`YYYY-MM-DD`) 산수 — **이 저장소에서 여기 한 곳입니다.**
 *
 * ## 왜 따로 두는가
 *
 * 프로젝트 화면에서 날짜를 세는 자리가 셋입니다 — 카드의 「오늘 위치」
 * (`project-span.ts`) · 간트의 막대 변환(`components/project-gantt-model.ts`) ·
 * 기간 축의 눈금 선택. 셋이 각자 `new Date(...)` 를 부르면 **한 곳만 시간대를
 * 타는 날**이 오고, 그 증상은 「어떤 프로젝트만 하루가 밀린다」라 아무도
 * 재현하지 못합니다. 원본(Orbee)이 같은 이유로 `lib/date/ymd` 를 두었고,
 * 그 파일의 머리말은 이 저장소가 겪은 것과 같은 사고를 다섯 번 적어 두었습니다.
 *
 * ## 전부 UTC 입니다 — 「자정」이 하나뿐이어야 합니다
 *
 * 우리 컬럼은 `date` 이고 service 가 **UTC 자정**으로 만들어 넘깁니다
 * (`schema.toDate`). 여기서 지역 시간대를 쓰면 그 자정이 서울에서 09:00 으로
 * 읽혀 **막대가 하루의 3분의 1만큼 밀립니다.** 하루 단위 일정에 시간대는 값이
 * 없으므로 아예 UTC 로 못 박습니다 — 간트도 `timeZone="UTC"` 로 돕니다
 * (`components/project-gantt.tsx`).
 *
 * ⚠️ 원본은 여기서 표시 시간대(`zonedInstant`/`zonedWallClock`)를 씁니다.
 *    그쪽은 캘린더와 간트가 **한 저장소에서 같은 순간 규약**을 공유해야 해서고,
 *    우리에게는 캘린더가 없습니다. 시간대를 쓰는 자리를 하나도 안 만드는 편이
 *    「어느 자정인가」를 두 번 생각하지 않는 길입니다.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 날짜 문자열의 **모양** — 이 정규식도 여기 하나입니다.
 *
 * 🔴 검증기(`schema.ts`)와 화면(`project-span.ts`·간트 모델)이 **같은 것**을
 *    봐야 합니다. 한쪽에만 적어 두면 「폼은 통과했는데 화면이 못 그리는 날짜」가
 *    생기고, 그 증상은 「저장은 됐는데 막대가 없다」라 원인을 못 찾습니다.
 * ⚠️ 모양만 봅니다 — 없는 날짜(`2026-02-30`)는 여기를 통과합니다. 그것을
 *    잡는 것은 아래 `diffDays` 의 되돌려 찍기입니다.
 */
export const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** 저장된 값이 날짜 꼴인가. DB 컬럼이 문자열로 나오는 자리에서 한 번 더 봅니다 */
export function isYmd(value: string | null | undefined): value is string {
  return typeof value === "string" && YMD.test(value);
}

/**
 * 🇰🇷 **화면이 말하는 「오늘」** — 서울 기준 달력 날짜입니다.
 *
 * 🔴 **여기만 UTC 가 아닙니다. 그리고 그래야 합니다.** 저장된 날짜는 시간대가
 *    없는 「달력 위의 한 칸」이라 UTC 로 붙잡는 것이 맞지만, *"오늘이 그 기간의
 *    어디쯤인가"* 는 **읽는 사람의 오늘**입니다. `toYmd(new Date())` 로 UTC 를
 *    쓰면 한국 시각 00:00~09:00 사이에 **어제**가 나옵니다 — 아침에 출근해
 *    목록을 여는 시간대가 정확히 그 구간입니다.
 *
 * 🔴 **서버가 한 번만 부릅니다**(`page.tsx`). 카드마다 브라우저에서 부르면
 *    ① 서버가 그린 HTML 과 브라우저가 다시 그린 것이 자정 근처에서 갈리고
 *    ② 사무실 밖 기기에서 하루가 밀립니다.
 *
 * ⚠️ **서울을 여기 적어 둡니다.** 이 저장소는 사내 전용이고 사무실이 하나라
 *    (`REQ-01`) 시간대가 설정값이 될 이유가 없습니다 — 값으로 두면 «아무도 안
 *    채우는 칸»이 하나 늘 뿐입니다. 사무실이 둘이 되는 날 이 상수 하나를
 *    옮기면 됩니다.
 * ⚠️ `en-CA` 로케일이 `YYYY-MM-DD` 를 냅니다. `sv-SE` 도 같지만 `en-CA` 가 이
 *    용도로 더 널리 쓰입니다 — 한국어 로케일은 «2026. 9. 8.» 이라 못 씁니다.
 */
const APP_TIMEZONE = "Asia/Seoul";

export function todayYmd(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(
    now
  );
}

/** `YYYY-MM-DD` → UTC 자정의 순간 */
export function atUtcMidnight(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** 순간 → 그 순간이 걸린 **UTC 의 날짜** */
export function toYmd(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * `n` 일 뒤의 날짜.
 *
 * 🔴 **달·해를 손으로 세지 않습니다.** 순간으로 바꿔 밀고 되돌립니다 — UTC 라
 *    서머타임이 없어 하루가 언제나 정확히 86,400,000ms 입니다.
 */
export function addDays(day: string, n: number): string {
  return toYmd(new Date(atUtcMidnight(day).getTime() + n * MS_PER_DAY));
}

/**
 * 두 날 사이의 **일수**(`to - from`). 없는 날짜(`2026-02-30`)면 `null`.
 *
 * 🔴 **못 세는 것을 0 으로 돌려주지 않습니다.** 0 은 「같은 날」이라는 사실이고
 *    `null` 은 「모른다」입니다 — 부르는 쪽이 그 둘을 갈라 그려야 합니다
 *    (`project-span.ts` 가 `percent: null` 로 갈라 두는 그 자리입니다).
 */
export function diffDays(from: string, to: string): number | null {
  const a = atUtcMidnight(from);
  const b = atUtcMidnight(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  /*
   * `new Date("2026-02-30T00:00:00.000Z")` 는 **NaN 이 아니라 3월 2일**입니다.
   * 되돌려 찍어 원문과 다르면 그 날짜는 존재하지 않는 날입니다 — 형식 검사
   * (`YMD` 정규식)만으로는 절대 못 잡는 갈래입니다.
   */
  if (toYmd(a) !== from || toYmd(b) !== to) return null;
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}
