import {
  extractVariables,
  type PromptInput,
} from "@/features/resources/content-types/prompt/schema";

/**
 * `PROMPT` — zod 출력 → 상세 테이블 행.
 *
 * **`variables` 는 사용자가 적지 않습니다.** 원문의 `[대괄호]` 에서 뽑습니다 —
 * 따로 적게 하면 원문과 어긋나고, 어긋난 쪽이 「무엇을 넣어야 하는가」를
 * 잘못 알려 줍니다. 원문이 정본이고 목록은 파생입니다.
 *
 * 파생이므로 **수정할 때마다 다시 뽑습니다.** 안 그러면 원문에서 자리를
 * 지웠는데 목록에는 남습니다.
 */
export function toRow(input: PromptInput) {
  return {
    promptText: input.promptText,
    useCase: input.useCase,
    targetModel: input.targetModel ?? null,
    variables: extractVariables(input.promptText),
    usageStatus: input.usageStatus ?? "REVIEWING",
  };
}
