import type { SkillInput } from "@/features/resources/content-types/skill/schema";

/** `SKILL` — zod 출력 → 상세 테이블 행. `ai-material/write.ts` 의 주석 참고 */
export function toRow(input: SkillInput) {
  return {
    skillName: input.skillName,
    definition: input.definition,
    triggerCondition: input.triggerCondition,
    usageExample: input.usageExample,
    targetClients: input.targetClients ?? [],
    usageStatus: input.usageStatus ?? "REVIEWING",
    version: input.version ?? null,
  };
}
