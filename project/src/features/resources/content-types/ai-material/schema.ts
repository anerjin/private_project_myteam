import { z } from "zod";

import {
  commaList,
  optionalDate,
  optionalInt,
  optionalText,
} from "@/features/resources/content-types/fields";

/**
 * `AI_MATERIAL` 입력 스키마 (`REQ-04 · 4.4`, `FR-TYPE-004`).
 *
 * **타입 폴더 안에 있습니다.** 라벨·아이콘·카드·상세·폼과 같은 자리입니다 —
 * 새 타입을 추가할 때 고칠 곳이 「폴더 하나 + 레지스트리 한 줄」이라는 `DEC-032` 의
 * 주장이 성립하려면 **검증 규칙도 여기 있어야** 합니다.
 *
 * `M0.5` 는 화면 쪽 확장성만 증명했고 **zod·service·Prisma 는 한 번도 통과하지
 * 않았습니다**(`DEV-07 · 7.4` 주의). 이 파일이 그 관통의 첫 조각입니다.
 *
 * `P7` 의 `API-100`(zod → JSON Schema)이 이 스키마를 그대로 내보냅니다 —
 * 그래서 화면 전용 표현이 아니라 **도메인 규칙**으로 씁니다.
 */

export const MATERIAL_KINDS = [
  "PAPER",
  "ARTICLE",
  "VIDEO",
  "MODEL",
  "SERVICE",
  "COURSE",
] as const;

export const LANGUAGES = ["KO", "EN", "ETC"] as const;

export const aiMaterialSchema = z.object({
  materialKind: z.enum(MATERIAL_KINDS),
  sourceName: optionalText(100),
  /**
   * 저자 목록. 폼은 쉼표로 받고 여기서 배열로 만듭니다 —
   * **경계에서 한 번만** 바꿉니다.
   */
  authors: commaList,
  /** `YYYY-MM-DD`. 빈 문자열은 «없음» 입니다 — 폼은 빈 칸을 보냅니다 */
  publishedAt: optionalDate,
  language: z.enum(LANGUAGES).optional(),
  readingTime: optionalInt(1, 10_000),
  keyPoints: optionalText(2000),
  applicability: optionalText(2000),
});

export type AiMaterialInput = z.infer<typeof aiMaterialSchema>;
