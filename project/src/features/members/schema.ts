import { z } from "zod";

/**
 * 회원 관리 입력 규칙 (FR-ADM-004 · REQ-02 · 2.4절).
 *
 * **서버와 화면이 같은 값을 봅니다.** 전에는 액션이 `min(2)`, 다이얼로그가
 * `length < 2` 로 **같은 규칙을 두 곳에** 두고 있었고, 둘 다 규격의 10자와 달랐습니다.
 * 규칙이 두 곳에 있으면 한 곳만 고치는 날이 옵니다 (`DEC-029`·`DEC-032`·`DEC-037`).
 *
 * zod 는 클라이언트에서도 돌아가므로 이 파일은 양쪽이 함께 씁니다
 * (`features/auth/schema.ts` 와 같은 자리).
 */

/** 거부·정지 사유 최소 길이. `FR-ADM-004` 수용 기준이 10자입니다. */
export const REASON_MIN_LENGTH = 10;
export const REASON_MAX_LENGTH = 500;

export const reasonSchema = z
  .string()
  .trim()
  /*
   * **문구가 중립입니다.** 전에는 「본인에게 그대로 전달됩니다」가 붙어 있었는데,
   * 이 스키마를 거부와 정지가 함께 쓰기 때문에 **정지 다이얼로그에서도** 그 말이 떴습니다 —
   * 바로 위 안내는 「본인에게는 전달되지 않습니다」라고 옳게 적혀 있어서
   * **한 화면 안의 두 문장이 서로를 부정**했습니다 (`DEC-041` 이 걷어낸 거짓 안내가
   * 공유 스키마를 타고 되돌아온 것입니다).
   *
   * 스키마는 **길이만** 압니다. 전달 여부는 다이얼로그의 `hint` 가 말합니다.
   */
  .min(REASON_MIN_LENGTH, `사유를 ${REASON_MIN_LENGTH}자 이상 적어 주세요.`)
  .max(REASON_MAX_LENGTH, `사유는 ${REASON_MAX_LENGTH}자를 넘을 수 없습니다.`);

/** 화면이 「확인」 버튼을 열어도 되는지 — 판정은 서버가 다시 합니다 */
export function isReasonLongEnough(reason: string): boolean {
  return reason.trim().length >= REASON_MIN_LENGTH;
}

/**
 * 비밀번호 초기화가 의미 있는 상태 (`REQ-02 · 2.3`, `FR-ADM-007`).
 *
 * `REJECTED`·`WITHDRAWN` 은 **로그인 자체가 막힌 계정**입니다. 초기화해 봐야 쓸 수 없고,
 * 「1년 후 익명화(해시 무효화)」 대상 계정에 새 해시를 찍어 되살리는 셈이 됩니다.
 *
 * **서버(`member.service`)와 메뉴(`member-table`)가 이 배열 하나를 함께 봅니다.**
 * 화면이 서버 판정을 흉내내는 것이 아니라 **같은 표를 보는** 것입니다 —
 * 표를 두 벌 두면 한쪽만 고치는 날이 옵니다.
 */
const RESETTABLE_STATUSES = new Set<string>(["ACTIVE", "PENDING", "SUSPENDED"]);

export function isResettableStatus(status: string): boolean {
  return RESETTABLE_STATUSES.has(status);
}

export type MemberStatus =
  "PENDING" | "ACTIVE" | "REJECTED" | "SUSPENDED" | "WITHDRAWN";

export type TransitionKind =
  "APPROVE" | "REJECT" | "REOPEN" | "SUSPEND" | "REACTIVATE" | "CHANGE_ROLE";

/**
 * 각 전이가 허용되는 «현재» 상태 (`REQ-02 · 2.3`, `DEC-042`).
 *
 * ## 화면과 서버가 **같은 표**를 봅니다 — 복제가 아니라 공유입니다
 *
 * `DEC-036` 의 *"판정을 화면에서 미리 하지 않는다"* 는 **동적 사실**을 겨눈 것입니다:
 * 「이 관리자가 마지막인가」·「방금 다른 관리자가 처리했는가」는 화면이 알 수 없고
 * 흉내내면 틀립니다. 그래서 `LAST_ADMIN`·동시성 판정은 여전히 서버 몫입니다.
 *
 * 반면 「`SUSPEND` 는 `ACTIVE` 에서만」은 **정적 사실**입니다. 이것까지 서버에만 두면
 * 화면은 `REJECTED` 회원에게 「정지」를 띄우고, 관리자는 눌러서 `INVALID_STATE` 를 받습니다 —
 * **판정을 «안 하는» 게 아니라 «틀리게 하는» 것**입니다.
 *
 * 표를 여기 둔 이유는 `member.service` 가 `server-only` 라 화면이 못 읽기 때문입니다.
 * `SPECS` 가 이 표를 읽으므로 **전이를 추가할 때 고칠 곳은 여전히 한 곳**입니다.
 *
 * > `P8` 이 얹을 것은 **행별 «동적» 판정**이지 이 표가 아닙니다 (`DEC-045`).
 */
export const TRANSITION_FROM: Record<TransitionKind, readonly MemberStatus[]> =
  {
    APPROVE: ["PENDING"],
    REJECT: ["PENDING"],
    REOPEN: ["REJECTED"],
    SUSPEND: ["ACTIVE"],
    REACTIVATE: ["SUSPENDED"],
    CHANGE_ROLE: ["ACTIVE"],
  };

/** 이 상태에서 «시도라도 해 볼 수 있는» 전이인가. 최종 판정은 서버가 다시 한다 */
export function canAttempt(kind: TransitionKind, status: string): boolean {
  return (TRANSITION_FROM[kind] as readonly string[]).includes(status);
}
