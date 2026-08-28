import type { z } from "zod";

import { aiMaterialSchema } from "@/features/resources/content-types/ai-material/schema";
import { devNoteSchema } from "@/features/resources/content-types/dev-note/schema";
import { githubRepoSchema } from "@/features/resources/content-types/github-repo/schema";
import { mcpServerSchema } from "@/features/resources/content-types/mcp-server/schema";
import { promptSchema } from "@/features/resources/content-types/prompt/schema";
import { skillSchema } from "@/features/resources/content-types/skill/schema";
import type { ResourceType } from "@/types";

/**
 * 타입별 **입력 스키마** 레지스트리.
 *
 * ## `index.ts` 와 **따로 둡니다**
 *
 * `content-types/index.ts` 는 `Card`·`Detail`·`Form`(React 컴포넌트)을 끌고 옵니다.
 * service 가 그것을 import 하면 **서버 그래프에 화면 컴포넌트가 들어옵니다.**
 * 스키마만 필요한 쪽은 이 파일을 봅니다 — zod 는 양쪽에서 돕니다.
 *
 * ## 레지스트리는 **그래프 경계마다 하나**입니다
 *
 * | 파일 | 무엇 | 누가 읽나 |
 * | --- | --- | --- |
 * | `index.ts` | 라벨·아이콘·`Card`·`Detail`·`Form` | 화면 |
 * | `operational.ts` | 노출·순서 같은 운영 사실 (import 없음) | 서버·화면 |
 * | **`schemas.ts`** | zod 입력 스키마 | 폼·service·`P7` 의 `API-100` |
 * | `writers.ts` | zod 출력 → 상세 테이블 행 | `resource.write` |
 *
 * 「폴더 하나 + 레지스트리 **한 줄**」이 아니라 **「폴더 하나 + 레지스트리마다
 * 한 줄」**입니다. 넷 다 `Record<ResourceType, …>` 라 **하나라도 빠뜨리면
 * 컴파일이 실패합니다** (`REQ-04 · 4.9`).
 *
 * ## `| null` 이 사라졌습니다
 *
 * `P4` 동안 이 표는 `z.ZodTypeAny | null` 이었고 다섯이 `null` 이었습니다 —
 * 「아직 저장할 수 없다」를 컴파일 시점 사실로 만든 장치였습니다.
 * `P5` 가 다섯을 채웠으므로 그 탈출구를 **없앱니다.** 일곱 번째 타입을
 * 추가하며 여기를 빠뜨리는 것이 이제 **오류**입니다.
 */
export const DETAIL_SCHEMAS: Record<ResourceType, z.ZodTypeAny> = {
  AI_MATERIAL: aiMaterialSchema,
  GITHUB_REPO: githubRepoSchema,
  MCP_SERVER: mcpServerSchema,
  SKILL: skillSchema,
  DEV_NOTE: devNoteSchema,
  PROMPT: promptSchema,
};
