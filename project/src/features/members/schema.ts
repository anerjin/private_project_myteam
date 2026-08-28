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
  .min(
    REASON_MIN_LENGTH,
    `사유를 ${REASON_MIN_LENGTH}자 이상 적어 주세요. 본인에게 그대로 전달됩니다.`
  )
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
