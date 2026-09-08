export const SITE = {
  name: "Neowave Work",
  description: "네오웨이브 운영 시스템",
} as const;

/*
 * `ROLE_LABEL`(「일반 회원」·「편집자」·「관리자」)이 여기 있었습니다.
 * **지웠습니다** (`DEC-077`) — 라벨을 붙일 등급이 없습니다.
 *
 * 감사 로그의 옛 `USER_ROLE_CHANGE` 행은 이 표를 안 씁니다. `diff` 패널은
 * before/after 를 **적힌 그대로** 그리므로(`features/audit/components/audit-table`)
 * 과거 기록은 이 표 없이도 읽힙니다.
 */
export const USER_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "활성",
  SUSPENDED: "정지",
  WITHDRAWN: "탈퇴",
};

/**
 * ## 카테고리 목록은 **여기 없습니다**
 *
 * `CATEGORIES` 배열이 여기 있었습니다. 상수처럼 보였지만 **정본은
 * `categories` 테이블**이고, 그 테이블에는 대분류 5 + 하위 22 = 27행이
 * 이미 있었습니다. 화면은 그걸 두고 여기 적힌 5개만 제안했습니다 —
 * 저장은 `slug` 로 행을 찾아 **못 찾으면 조용히 `null`** 이므로,
 * 두 목록이 어긋나는 순간 사용자가 고른 분류가 오류 없이 사라집니다.
 *
 * `server/services/category.service.ts` 가 읽습니다.
 *
 * 콘텐츠 타입 정의도 여기 없습니다 —
 * `features/resources/content-types` 레지스트리가 정본입니다.
 * (`config` 는 `features` 를 참조할 수 없습니다 — DEV-06 · 6.9절)
 */
