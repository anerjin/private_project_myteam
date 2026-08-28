import { z } from "zod";

import { DETAIL_SCHEMAS } from "@/features/resources/content-types/schemas";
import { RESOURCE_TYPES } from "@/features/resources/list.schema";
import type { ResourceType } from "@/types";

/**
 * 자료 등록·수정 입력 (`FR-RES-004` 등록 · `FR-RES-005` URL 빠른 등록 · `FR-RES-006` 수정).
 *
 * **공통 뼈대는 여기, 타입 전용은 타입 폴더** (`content-types/<type>/schema.ts`).
 * 이 파일이 둘을 합칩니다 — 합치는 곳이 하나여야 웹과 Ingest(`P7`)가 같은 규칙을 씁니다.
 */

/** 태그는 쉼표로 받는다. 정규화(소문자·공백 제거)를 **경계에서 한 번** 한다 */
const tagsField = z
  .union([z.string(), z.array(z.string())])
  .transform((v) =>
    Array.from(
      new Set(
        (Array.isArray(v) ? v : v.split(","))
          .map((s) => s.trim().toLowerCase().replace(/^#/, ""))
          .filter(Boolean)
      )
    ).slice(0, 10)
  )
  .optional();

export const resourceBaseSchema = z.object({
  type: z.enum(RESOURCE_TYPES),
  title: z.string().trim().min(2, "제목을 적어 주세요.").max(200),
  summary: z.string().trim().max(300).optional(),
  /**
   * 빈 문자열을 `undefined` 로 떨어뜨립니다 — 폼은 안 채운 칸을 `""` 로 보내는데,
   * `z.string().url()` 은 그것을 «잘못된 URL» 이라고 합니다. 사용자는 그냥 안 적었을 뿐입니다.
   */
  url: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v))
    .pipe(z.string().url("올바른 URL 이 아닙니다.").max(2000).optional()),
  body: z.string().max(100_000).optional(),
  category: z.string().trim().max(50).optional(),
  tags: tagsField,
});

/**
 * 타입에 맞는 상세 스키마를 붙여 파싱한다.
 *
 * **`superRefine` 으로 합치지 않고 두 번 파싱합니다.** 상세 스키마가 타입마다
 * 모양이 다르므로 하나의 zod 객체로 만들면 판별 유니온 6개를 손으로 유지해야 하고,
 * `P5` 가 타입을 추가할 때 이 파일을 고치게 됩니다 — 「폴더 하나 + 한 줄」이 깨집니다.
 */
export type ParsedResourceInput = z.infer<typeof resourceBaseSchema> & {
  detail: Record<string, unknown>;
};

export type ParseResult =
  | { ok: true; data: ParsedResourceInput }
  | { ok: false; fieldErrors: Record<string, string[]> };

export function parseResourceInput(raw: unknown): ParseResult {
  const base = resourceBaseSchema.safeParse(raw);
  if (!base.success) {
    return { ok: false, fieldErrors: flatten(base.error) };
  }

  const detailSchema = DETAIL_SCHEMAS[base.data.type as ResourceType];
  if (!detailSchema) {
    return {
      ok: false,
      fieldErrors: {
        type: ["이 타입은 아직 등록할 수 없습니다. (P5 에서 열립니다)"],
      },
    };
  }

  const detail = detailSchema.safeParse(raw);
  if (!detail.success) {
    return { ok: false, fieldErrors: flatten(detail.error) };
  }

  return {
    ok: true,
    data: { ...base.data, detail: detail.data as Record<string, unknown> },
  };
}

function flatten(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
