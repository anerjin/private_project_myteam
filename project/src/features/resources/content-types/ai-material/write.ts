import type { AiMaterialInput } from "@/features/resources/content-types/ai-material/schema";

/**
 * `AI_MATERIAL` — zod 출력 → **상세 테이블 행**.
 *
 * ## 왜 스키마 출력을 그대로 넘기지 않는가
 *
 * `writeDetail` 은 등록과 수정을 겸하고 안은 `upsert` 입니다.
 * **Prisma 의 `update` 는 `undefined` 를 「그대로 두라」로 읽습니다.**
 * zod `.optional()` 의 출력이 바로 그 `undefined` 입니다. 그러니 통과시키면:
 *
 * > 사용자가 수정 폼에서 「출처」를 **지우고 저장하면 옛 값이 그대로 남습니다.**
 * > 오류는 없고 화면은 저장됐다고 말합니다.
 *
 * **`undefined` 를 `null` 로 바꾸는 것이 이 파일의 본체**이고, 그래서 이게
 * 「매핑」이지 「통과」가 아닙니다. 날짜 문자열 → `Date`, 없는 배열 → `[]` 도 같습니다.
 *
 * ## Prisma 를 모릅니다
 *
 * 순수 함수입니다. `tx` 도 델리게이트도 여기 없습니다 — 그건
 * `resource.write.ts` 의 `DETAIL_UPSERT` 가 **타입이 살아 있는 채로** 합니다.
 * 이 폴더가 `@prisma/client` 를 알면 `card.tsx`·`form.tsx` 와 같은 자리에서
 * 서버 타입을 끌고 오게 되고, `P4` 가 `schemas.ts`·`operational.ts` 를 떼어낸
 * 이유가 무의미해집니다. `check-deps` 가 그 경계를 막습니다.
 */
export function toRow(input: AiMaterialInput) {
  return {
    materialKind: input.materialKind,
    sourceName: input.sourceName ?? null,
    authors: input.authors ?? [],
    publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
    language: input.language ?? null,
    readingTime: input.readingTime ?? null,
    keyPoints: input.keyPoints ?? null,
    applicability: input.applicability ?? null,
  };
}
