import { z } from "zod";

/**
 * 타입 스키마가 함께 쓰는 **입력 칸 조각들**.
 *
 * ## 폼은 «안 적은 칸»을 빈 문자열로 보냅니다
 *
 * `FormData` 에 `undefined` 는 없습니다. 그래서 `z.string().optional()` 은
 * 「안 적었다」를 못 봅니다 — `""` 라는 **값**을 봅니다. 그대로 두면:
 *
 * | 칸 | 그대로 두면 | 실제 뜻 |
 * | --- | --- | --- |
 * | 문자열 | DB 에 `""` 가 저장됨 | 「없음」이어야 하므로 `NULL` |
 * | 숫자 | `z.coerce.number()` 가 `Number("") = 0` | 「안 적었다」이지 0이 아님 |
 * | 날짜 | `regex` 가 「형식이 틀렸다」고 함 | 그냥 안 적은 것 |
 *
 * 셋 다 **오류가 아니라 조용한 오답**입니다. 숫자 칸이 특히 나쁩니다 —
 * `readingTime: z.coerce.number().min(1)` 에 빈 칸이 오면 `0` 이 되어
 * 「1 이상이어야 합니다」라는 **엉뚱한 메시지**가 뜹니다.
 *
 * `resourceBaseSchema` 의 `url` 이 이미 같은 처리를 하고 있었습니다.
 * 타입 스키마 다섯이 그것을 각자 잊지 않도록 여기 모읍니다.
 *
 * > 이 파일은 zod 만 압니다. 타입 폴더끼리 참조하는 것이 아니라
 * > **공통 조각을 위로 올린 것**이라 `check-deps` 의 「타입 간 결합 금지」에
 * > 걸리지 않습니다 (`schemas.ts`·`writers.ts` 와 같은 자리).
 */

/** 빈 칸은 «안 적음». 공백만 있는 것도 마찬가지 */
const blankToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

/** 선택 입력 문자열 — 빈 칸이면 `undefined` 라 `write.ts` 가 `null` 로 만든다 */
export function optionalText(max: number) {
  return z.preprocess(
    blankToUndefined,
    z.string().trim().max(max).optional()
  );
}

/** 선택 입력 숫자 — 빈 칸이 `0` 이 되지 않는다 */
export function optionalInt(min: number, max: number) {
  return z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(min).max(max).optional()
  );
}

/** `YYYY-MM-DD`. 빈 칸은 「없음」이고 형식 오류가 아니다 */
export const optionalDate = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식으로 적어 주세요.")
    .optional()
);

/**
 * 쉼표로 받는 목록. **경계에서 한 번만** 배열로 바꿉니다.
 * 체크박스 묶음처럼 같은 `name` 이 여럿 오는 경우도 받습니다
 * (`resource-form` 이 그때 배열로 넘깁니다).
 */
export const commaList = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    const parts = (Array.isArray(v) ? v : v.split(","))
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length ? parts : undefined;
  });
