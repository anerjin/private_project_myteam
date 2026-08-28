export const SITE = {
  name: "QueenBee",
  description: "DOI 개발팀 정보 시스템",
} as const;

export const ROLE_LABEL: Record<string, string> = {
  MEMBER: "일반 회원",
  EDITOR: "편집자",
  ADMIN: "관리자",
};

export const USER_STATUS_LABEL: Record<string, string> = {
  PENDING: "승인 대기",
  ACTIVE: "활성",
  REJECTED: "거부",
  SUSPENDED: "정지",
  WITHDRAWN: "탈퇴",
};

export const CATEGORIES = [
  { slug: "ai-model", name: "AI · 모델" },
  { slug: "ai-tools", name: "AI 도구" },
  { slug: "geospatial", name: "공간정보" },
  { slug: "dev", name: "개발" },
  { slug: "internal", name: "사내" },
];

/**
 * 콘텐츠 타입 정의는 여기 없습니다.
 * `features/resources/content-types` 레지스트리가 정본입니다.
 * (`config` 는 `features` 를 참조할 수 없습니다 — DEV-06 · 6.9절)
 */
