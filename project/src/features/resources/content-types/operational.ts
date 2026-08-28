import type { ResourceType } from "@/types";

/**
 * 콘텐츠 타입의 **운영 사실** — 아이콘도 컴포넌트도 끌고 오지 않습니다.
 *
 * ## 왜 `meta.ts` 와 나눴는가
 *
 * `meta.ts` 는 `lucide-react` 아이콘을 import 하고, `index.ts` 는 거기에
 * `Card`·`Detail`·`Form`(React 컴포넌트)까지 얹습니다.
 * **서버 service 가 그것을 import 하면 화면 컴포넌트가 서버 그래프에 들어옵니다** —
 * `schemas.ts` 를 따로 둔 것과 **같은 이유**이고, 실제로 `content-type.service` 가
 * 레지스트리를 읽자 검증 스크립트가 React 런타임 없이 못 돌았습니다.
 *
 * `DEC-032` 의 갈래와도 맞습니다 — **표현(아이콘·배지 색)은 `meta.ts`,
 * 운영(노출·순서)은 여기.** DB 의 `content_type_settings` 가 덮어쓰는 것도 이 값들입니다.
 *
 * **`meta.ts` 가 이 표를 읽습니다.** 두 벌이 되지 않게 하기 위해서입니다.
 */
export interface OperationalMeta {
  code: ResourceType;
  /** URL 세그먼트 — `/resources/{slug}` */
  slug: string;
  label: string;
  description: string;
  /** 사이드바 기본 노출. 운영자가 `content_type_settings` 로 덮어쓸 수 있다 */
  showInNav: boolean;
  sortOrder: number;
  isActive: boolean;
}

export const OPERATIONAL: Record<ResourceType, OperationalMeta> = {
  AI_MATERIAL: {
    code: "AI_MATERIAL",
    slug: "ai-material",
    label: "AI 자료",
    description: "논문 · 아티클 · 영상 · 모델 · 서비스 소개",
    showInNav: true,
    sortOrder: 10,
    isActive: true,
  },
  GITHUB_REPO: {
    code: "GITHUB_REPO",
    slug: "github-repo",
    label: "GitHub 저장소",
    description: "오픈소스 저장소 메타 + 소스 아카이브",
    showInNav: true,
    sortOrder: 20,
    isActive: true,
  },
  MCP_SERVER: {
    code: "MCP_SERVER",
    slug: "mcp-server",
    label: "MCP 서버",
    description: "사내에서 쓰는 MCP 서버 설치 · 설정 정보",
    showInNav: true,
    sortOrder: 30,
    isActive: true,
  },
  SKILL: {
    code: "SKILL",
    slug: "skill",
    label: "Skill",
    description: "AI 에이전트 Skill 정의와 사용법",
    showInNav: true,
    sortOrder: 40,
    isActive: true,
  },
  DEV_NOTE: {
    code: "DEV_NOTE",
    slug: "dev-note",
    label: "개발 노트",
    description: "사내 규약 · 팁 · 트러블슈팅 기록",
    showInNav: true,
    sortOrder: 50,
    isActive: true,
  },
  PROMPT: {
    code: "PROMPT",
    slug: "prompt",
    label: "프롬프트",
    description: "잘 동작한 프롬프트 템플릿",
    showInNav: true,
    sortOrder: 60,
    isActive: true,
  },
};

export function listOperational(): OperationalMeta[] {
  return Object.values(OPERATIONAL).sort((a, b) => a.sortOrder - b.sortOrder);
}
