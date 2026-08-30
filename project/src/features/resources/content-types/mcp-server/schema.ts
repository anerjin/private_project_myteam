import { z } from "zod";

import { USAGE_STATUSES } from "@/features/resources/content-types/usage-status";

import {
  commaList,
  optionalText,
} from "@/features/resources/content-types/fields";

/**
 * `MCP_SERVER` 입력 스키마 (`REQ-04 · 4.4`, `FR-TYPE-006`).
 *
 * ## `configJson` 을 **문자열로 저장하고, 파싱은 검증으로만** 합니다
 *
 * 컬럼이 `String` 입니다(`config_json`). 사람이 붙여넣은 **그대로** 보여줘야
 * 하기 때문입니다 — JSON 으로 파싱해 다시 찍으면 주석·들여쓰기·키 순서가
 * 바뀌어 「내가 넣은 것과 다르다」가 됩니다. 대신 **파싱되는지는 확인**합니다:
 * 안 되면 화면의 「복사」 버튼이 붙여넣는 순간 깨지는 설정을 나눠 주게 됩니다.
 *
 * ## 환경변수는 **값을 받지 않습니다** (`NFR-SEC-008`)
 *
 * `키 / 설명 / 필수 / 예시` 만 받습니다. 「예시」에 진짜 토큰을 적는 사람이
 * 있으므로 스키마가 그것까지 막을 수는 없지만, **값 칸을 아예 두지 않는 것**이
 * 이 규칙의 실질입니다 — 있으면 채웁니다.
 */

export const MCP_TRANSPORTS = ["STDIO", "SSE", "HTTP"] as const;

/** `[{key, description, required, example}]` — 폼은 JSON 문자열로 보냅니다 */
const envVarSchema = z.object({
  key: z.string().trim().min(1).max(100),
  description: z.string().trim().max(300).optional(),
  required: z.coerce.boolean().optional(),
  example: z.string().trim().max(300).optional(),
});

const providedToolSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(300).optional(),
});

/**
 * 폼이 보내는 JSON 문자열을 배열로 만듭니다. **빈 칸은 «없음»**이고,
 * 형식이 틀리면 오류입니다 — 조용히 버리면 사용자가 적은 것이 사라집니다.
 *
 * ## 배열 갈래에 **`item` 을 그대로 씁니다** — `z.unknown()` 이 아니라
 *
 * 처음에는 `z.array(z.unknown())` 이었고 검사는 아래 `transform` 안에서만
 * 했습니다. 동작은 같았지만 **`API-100` 이 내보내는 JSON Schema 가
 * `items: {}`(무엇이든)** 이 됐습니다 — `z.toJSONSchema` 는 선언된 입력
 * 타입만 볼 수 있고 `transform` 안은 못 봅니다.
 *
 * 그래서 에이전트가 스키마를 «믿고» `["QUEENBEE_URL", …]` 처럼 보내면
 * 서버가 422 로 거절합니다. 실제로 이 저장소에 자료를 채우면서 그렇게
 * 걸렸습니다. 자기 계약을 스스로 어기는 선언이고, 이 저장소가 반복해서
 * 지워 온 형태입니다 — 이제 **선언이 계약을 담습니다.**
 */
function jsonArray<T extends z.ZodTypeAny>(item: T, label: string) {
  return z
    .union([z.string(), z.array(item)], {
      error: `${label} 형식이 맞지 않습니다.`,
    })
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === "") return undefined;
      let parsed: unknown = v;
      if (typeof v === "string") {
        try {
          parsed = JSON.parse(v);
        } catch {
          ctx.addIssue({
            code: "custom",
            message: `${label} 은 JSON 배열이어야 합니다.`,
          });
          return z.NEVER;
        }
      }
      const r = z.array(item).safeParse(parsed);
      if (!r.success) {
        ctx.addIssue({ code: "custom", message: `${label} 형식이 맞지 않습니다.` });
        return z.NEVER;
      }
      return r.data;
    });
}

export const mcpServerSchema = z.object({
  packageName: optionalText(200),
  transport: z.enum(MCP_TRANSPORTS),
  installCommand: optionalText(500),
  configJson: z
    .string()
    .trim()
    .min(1, "설정 JSON 을 적어 주세요.")
    .max(20_000)
    .refine((s) => {
      try {
        JSON.parse(s);
        return true;
      } catch {
        return false;
      }
    }, "JSON 으로 읽히지 않습니다. 붙여넣은 그대로 저장되므로 형식을 맞춰 주세요."),
  envVars: jsonArray(envVarSchema, "환경변수"),
  providedTools: jsonArray(providedToolSchema, "제공 도구"),
  /** 쉼표로 받습니다 — `authors` 와 같은 방식 */
  clientSupport: commaList,
  usageStatus: z.enum(USAGE_STATUSES).optional(),
});

export type McpServerInput = z.infer<typeof mcpServerSchema>;
