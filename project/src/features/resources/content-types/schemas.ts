import type { z } from "zod";

import { aiMaterialSchema } from "@/features/resources/content-types/ai-material/schema";
import type { ResourceType } from "@/types";

/**
 * 타입별 입력 스키마 레지스트리.
 *
 * ## `index.ts` 와 **따로 둡니다**
 *
 * `content-types/index.ts` 는 `Card`·`Detail`·`Form`(React 컴포넌트)을 끌고 옵니다.
 * service 가 그것을 import 하면 **서버 그래프에 화면 컴포넌트가 들어옵니다.**
 * 스키마만 필요한 쪽은 이 파일을 봅니다 — zod 는 양쪽에서 돕니다.
 *
 * ## 스키마가 없는 타입은 **저장할 수 없습니다**
 *
 * `P4` 의 범위는 **`AI_MATERIAL` 1종 관통**입니다 (`DEV-07 · 7.4`).
 * 나머지 5종은 `P5` 몫이고, 여기서 `null` 인 것이 그 경계를 **컴파일 시점 사실**로
 * 만듭니다 — 「되는 줄 알았는데 insert 에서 NOT NULL 로 터진다」보다 낫습니다.
 * `P5` 는 각 폴더에 `schema.ts` 를 놓고 **이 표에 한 줄**을 채웁니다.
 */
export const DETAIL_SCHEMAS: Record<ResourceType, z.ZodTypeAny | null> = {
  AI_MATERIAL: aiMaterialSchema,
  GITHUB_REPO: null,
  MCP_SERVER: null,
  SKILL: null,
  DEV_NOTE: null,
  PROMPT: null,
};

/** 지금 등록·수정할 수 있는 타입인가 */
export function isWritableType(type: ResourceType): boolean {
  return DETAIL_SCHEMAS[type] !== null;
}

export function writableTypes(): ResourceType[] {
  return (Object.keys(DETAIL_SCHEMAS) as ResourceType[]).filter(isWritableType);
}
