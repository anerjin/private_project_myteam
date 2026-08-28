import type { DevNoteInput } from "@/features/resources/content-types/dev-note/schema";

/** `DEV_NOTE` — zod 출력 → 상세 테이블 행. `ai-material/write.ts` 의 주석 참고 */
export function toRow(input: DevNoteInput) {
  return {
    noteKind: input.noteKind,
    relatedProject: input.relatedProject ?? null,
    occurredAt: input.occurredAt ? new Date(input.occurredAt) : null,
  };
}
