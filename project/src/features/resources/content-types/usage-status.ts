/**
 * 사용 상태 — `MCP_SERVER`·`SKILL`·`PROMPT` 셋이 공유합니다 (`REQ-04 · 4.4`).
 *
 * > 같은 세 낱말이 **다섯 곳**에 복사돼 있었습니다 — `badges.tsx`,
 * > `mcp-server/card.tsx`, `mcp-server/form.tsx`, `prompt/card.tsx`,
 * > `prompt/form.tsx`. 그리고 `USAGE_STATUSES` 상수는 스키마 세 곳에 따로
 * > 선언돼 있었습니다. 한 사실이 여덟 곳에 있었던 셈입니다.
 *
 * ## 폼의 선택지는 이 표를 **돌려서** 그립니다
 *
 * 손으로 `<SelectItem value="ADOPTED">` 를 적으면 값이 enum 과 어긋나도 아무도
 * 모릅니다 — Radix 의 `Select` 는 **SSR HTML 에 선택지 값을 내보내지 않아서**
 * 렌더된 결과를 검사해도 안 잡힙니다. `Record<UsageStatus, string>` 을 돌리면
 * **컴파일러가 그 일을 합니다.**
 */
export const USAGE_STATUSES = ["REVIEWING", "ADOPTED", "DEPRECATED"] as const;

export type UsageStatus = (typeof USAGE_STATUSES)[number];

export const USAGE_STATUS_LABEL: Record<UsageStatus, string> = {
  REVIEWING: "검토 중",
  ADOPTED: "사내 사용",
  DEPRECATED: "사용 중단",
};
