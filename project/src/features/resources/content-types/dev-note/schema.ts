import { z } from "zod";

/**
 * `DEV_NOTE` 입력 스키마 (`REQ-04 · 4.4`).
 *
 * `ai-material/schema.ts` 와 같은 자리·같은 이유입니다 — 새 타입을 추가할 때
 * 고칠 곳이 「폴더 하나 + 레지스트리 한 줄」이려면 **검증 규칙도 폴더 안에**
 * 있어야 합니다.
 *
 * > **이 타입의 폼에는 `name` 이 하나도 없었습니다.** `FormData` 는 `name` 없는
 * > 입력을 **싣지 않습니다** — 노트 종류·관련 프로젝트·발생일이 전부 조용히
 * > 사라지고, zod 는 「없는 값」을 보게 됩니다. `noteKind` 는 필수라 저장이
 * > 막혔을 것이고, 사용자는 「왜 안 되는지」를 알 수 없었을 것입니다.
 * > `id` 만 있고 `name` 이 없는 것은 **화면에서는 멀쩡해 보입니다.**
 */

export const NOTE_KINDS = [
  "CONVENTION",
  "TROUBLESHOOT",
  "TIP",
  "RETRO",
] as const;

export const devNoteSchema = z.object({
  noteKind: z.enum(NOTE_KINDS),
  relatedProject: z.string().trim().max(100).optional(),
  /** `YYYY-MM-DD`. 빈 문자열은 «없음» — 폼은 빈 칸을 보냅니다 */
  occurredAt: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식으로 적어 주세요.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type DevNoteInput = z.infer<typeof devNoteSchema>;
