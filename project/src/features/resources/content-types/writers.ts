import { toRow as aiMaterial } from "@/features/resources/content-types/ai-material/write";
import { toRow as devNote } from "@/features/resources/content-types/dev-note/write";
import { toRow as githubRepo } from "@/features/resources/content-types/github-repo/write";
import { toRow as mcpServer } from "@/features/resources/content-types/mcp-server/write";
import { toRow as prompt } from "@/features/resources/content-types/prompt/write";
import { toRow as skill } from "@/features/resources/content-types/skill/write";
import type { ResourceType } from "@/types";

/**
 * zod 출력 → **상세 테이블 행**. `schemas.ts` 의 쌍둥이입니다.
 *
 * ## 왜 스키마 출력을 그대로 쓰지 않는가
 *
 * `writeDetail` 은 등록과 수정을 겸하고 안은 `upsert` 입니다.
 * **Prisma 의 `update` 는 `undefined` 를 「그대로 두라」로 읽습니다** —
 * zod `.optional()` 의 출력이 바로 그것입니다. 그러니 통과시키면
 * **수정 폼에서 칸을 비우고 저장해도 옛 값이 남습니다.** 오류는 없고
 * 화면은 저장됐다고 말합니다.
 *
 * 「`undefined` → `null`」이 각 `write.ts` 의 본체이고, 그래서 이게
 * **매핑이지 통과가 아닙니다.** 날짜 문자열 → `Date`, 콤마 문자열 → 배열,
 * 파생값(`PROMPT` 의 `variables`)도 여기서 만듭니다.
 *
 * ## Prisma 델리게이트는 **여기 없습니다**
 *
 * 이 폴더는 `card.tsx`·`form.tsx` 와 같은 자리라 `@prisma/client` 를 알면 안
 * 됩니다(`check-deps` 가 막습니다). 그래서 이 표는 **행을 만들 뿐**이고,
 * 어느 테이블에 쓰는지는 `resource.write.ts` 의 `DETAIL_UPSERT` 가 압니다.
 *
 * > 델리게이트 이름을 문자열(`"aiMaterial"`)로 여기 두는 안도 있었지만
 * > `tx[name]` 은 캐스트가 필요하고, 그러면 **컬럼 이름 오타가 컴파일 오류가
 * > 아니라 런타임 오류**가 됩니다. 여섯 줄을 서버 쪽에 두고 타입을 살립니다.
 *
 * 입력이 `unknown` 인 것은 `parseResourceInput` 이 `detail` 을
 * `Record<string, unknown>` 으로 넘기기 때문입니다. **각 `toRow` 는 자기
 * 스키마의 출력 타입을 받으므로** 그 경계에서 한 번만 좁힙니다.
 */
/**
 * **`satisfies` 로 씁니다.** `Record<ResourceType, …>` 로 «선언»하면 각 줄의
 * 반환 타입이 그 자리에서 넓어져 버리고, `resource.write` 는 `Record<string,
 * unknown>` 을 받아 **컬럼 이름 오타를 잡을 수 없게** 됩니다.
 * `satisfies` 는 「여섯 개가 다 있는가」를 검사하면서 **각 줄의 정확한 타입은
 * 그대로 남깁니다** — 빠뜨리면 여전히 컴파일 오류입니다.
 */
export const DETAIL_WRITERS = {
  AI_MATERIAL: aiMaterial,
  GITHUB_REPO: githubRepo,
  MCP_SERVER: mcpServer,
  SKILL: skill,
  DEV_NOTE: devNote,
  PROMPT: prompt,
} satisfies Record<ResourceType, (detail: never) => object>;

/** 타입별 상세 «행»의 모양 — `resource.write` 의 표가 이것으로 각 줄을 받습니다 */
export type DetailRow<T extends ResourceType> = ReturnType<
  (typeof DETAIL_WRITERS)[T]
>;

/**
 * 파싱된 상세를 행으로. 타입 분기가 아니라 **표 조회**입니다.
 *
 * 반환이 유니온인 것은 사실 그대로입니다 — 어느 타입인지는 `type` 이 정하고,
 * 그 둘을 맞추는 것은 호출부(`writeDetail`)의 한 자리에서 끝납니다.
 */
export function toDetailRow<T extends ResourceType>(
  type: T,
  detail: Record<string, unknown>
): DetailRow<T> {
  const write = DETAIL_WRITERS[type] as (d: unknown) => DetailRow<T>;
  return write(detail);
}
