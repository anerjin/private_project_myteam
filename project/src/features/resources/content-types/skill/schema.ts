import { z } from "zod";

import { USAGE_STATUSES } from "@/features/resources/content-types/usage-status";

import {
  commaList,
  optionalText,
} from "@/features/resources/content-types/fields";

/**
 * `SKILL` 입력 스키마 (`REQ-04 · 4.4`, `FR-TYPE-007`).
 *
 * 필수 넷(`skillName`·`definition`·`triggerCondition`·`usageExample`)은
 * DB 에서도 `NOT NULL` 입니다. **여기서 막지 않으면 insert 에서 터집니다** —
 * 사용자에게는 「처리 중 문제가 발생했습니다」로 보입니다.
 *
 * > **폼의 입력 이름이 이 키와 달랐습니다.** `id="trigger"`·`id="example"` 인데
 * > 컬럼은 `trigger_condition`·`usage_example` 입니다. `name` 을 붙이는 것만으로는
 * > 부족하고 **이름이 맞아야** 합니다 — `FormData` 는 모르는 키를 그냥 싣고,
 * > zod 는 없는 키를 「안 적었다」로 봅니다. 둘 다 오류를 내지 않습니다.
 */


export const skillSchema = z.object({
  skillName: z
    .string()
    .trim()
    .min(1, "Skill 이름을 적어 주세요.")
    .max(100)
    /*
     * Skill 이름은 파일명·디렉터리명이 되므로 좁힙니다 (`FR-CLI-009` 가 이
     * 저장소의 Skill 을 그대로 내려받아 씁니다). 한글 이름은 도구가 못 읽습니다.
     */
    .regex(
      /^[a-z0-9][a-z0-9-]*$/,
      "영문 소문자·숫자·하이픈만 쓸 수 있습니다 (예: neowave-work-collect)."
    ),
  definition: z
    .string()
    .trim()
    .min(1, "Skill 정의 원문을 붙여넣어 주세요.")
    .max(100_000),
  triggerCondition: z
    .string()
    .trim()
    .min(1, "언제 이 Skill 이 발동하는지 적어 주세요.")
    .max(2000),
  usageExample: z.string().trim().min(1, "사용 예시를 적어 주세요.").max(2000),
  /** 쉼표로 받습니다 — Claude Code · Cursor 등 */
  targetClients: commaList,
  usageStatus: z.enum(USAGE_STATUSES).optional(),
  version: optionalText(50),
});

export type SkillInput = z.infer<typeof skillSchema>;
