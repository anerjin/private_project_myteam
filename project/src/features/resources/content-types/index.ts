import { aiMaterial } from "@/features/resources/content-types/ai-material";
import { devNote } from "@/features/resources/content-types/dev-note";
import { githubRepo } from "@/features/resources/content-types/github-repo";
import { mcpServer } from "@/features/resources/content-types/mcp-server";
import { prompt } from "@/features/resources/content-types/prompt";
import { skill } from "@/features/resources/content-types/skill";
import type { ContentTypeDefinition } from "@/features/resources/content-types/types";
import type { ResourceType } from "@/types";

/**
 * 콘텐츠 타입 레지스트리.
 *
 * **새 타입을 추가할 때 고치는 파일은 이 파일 한 줄과 그 타입 폴더뿐입니다.**
 * 목록·검색·필터·북마크·권한·감사 로그는 공통 코드가 처리하므로 손대지 않습니다.
 * (REQ-04 · 4.9절 / DEV-06 · 6.5절)
 */
export const CONTENT_TYPES = {
  AI_MATERIAL: aiMaterial,
  GITHUB_REPO: githubRepo,
  MCP_SERVER: mcpServer,
  SKILL: skill,
  DEV_NOTE: devNote,
  PROMPT: prompt,
} satisfies Record<ResourceType, ContentTypeDefinition>;

export type {
  ContentTypeDefinition,
  ContentTypeMeta,
} from "@/features/resources/content-types/types";

export function getContentType(code: ResourceType): ContentTypeDefinition {
  return CONTENT_TYPES[code];
}

/** 정렬·활성 필터를 적용한 목록. 화면은 항상 이걸 쓴다 */
export function listContentTypes(): ContentTypeDefinition[] {
  return Object.values(CONTENT_TYPES)
    .filter((t) => t.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getContentTypeBySlug(
  slug: string
): ContentTypeDefinition | undefined {
  return Object.values(CONTENT_TYPES).find((t) => t.slug === slug);
}

/** URL 빠른 등록의 타입 추정 (FR-RES-005). 못 맞히면 AI 자료로 본다 */
export function detectTypeFromUrl(url: string): ResourceType {
  const hit = listContentTypes().find((t) => t.detectFromUrl?.(url));
  return hit?.code ?? "AI_MATERIAL";
}
