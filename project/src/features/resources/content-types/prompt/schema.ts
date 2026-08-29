import { z } from "zod";

import { USAGE_STATUSES } from "@/features/resources/content-types/usage-status";

import { optionalText } from "@/features/resources/content-types/fields";

/**
 * `PROMPT` 입력 스키마 (`REQ-04 · 4.4`).
 *
 * `promptText` 와 `useCase` 가 `NOT NULL` 입니다. 프롬프트 «원문»만 있고
 * 「어떤 상황에 쓰는가」가 없으면 **다음 사람이 못 씁니다** — 그게 이 시스템의
 * 존재 이유라 스키마가 필수로 잡습니다.
 *
 * ## 치환 자리는 **원문에서 뽑습니다**
 *
 * 화면 안내가 *"치환할 자리는 `[대괄호]` 로 표시하세요"* 입니다.
 * 사용자에게 변수 목록을 따로 적게 하면 원문과 어긋나고, 어긋난 쪽이
 * 「이 프롬프트에 무엇을 넣어야 하는가」를 잘못 알려 줍니다 —
 * **한 사실을 두 곳에 두지 않습니다.** 원문이 정본이고 목록은 파생입니다.
 */


/** `[이름]` 을 순서대로, 중복 없이 */
export function extractVariables(text: string): { name: string }[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(/\[([^\]\n]{1,50})\]/g)) {
    const name = m[1].trim();
    if (name) seen.add(name);
  }
  return [...seen].map((name) => ({ name }));
}

export const promptSchema = z.object({
  promptText: z
    .string()
    .trim()
    .min(1, "프롬프트 원문을 적어 주세요.")
    .max(50_000),
  useCase: z
    .string()
    .trim()
    .min(1, "어떤 상황에 쓰는 프롬프트인지 적어 주세요.")
    .max(500),
  targetModel: optionalText(100),
  usageStatus: z.enum(USAGE_STATUSES).optional(),
});

export type PromptInput = z.infer<typeof promptSchema>;
