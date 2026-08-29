import { z } from "zod";

import { ingest, json } from "@/app/api/ingest/_lib/handler";
import { DETAIL_SCHEMAS } from "@/features/resources/content-types/schemas";
import * as contentTypeService from "@/server/services/content-type.service";

/**
 * API-100 콘텐츠 타입 + **타입별 JSON Schema** (`FR-CLI-002`).
 *
 * ## 스키마를 **서버가 만들어 내려줍니다**
 *
 * 그래서 타입이 늘어도 **MCP 서버 코드를 고칠 필요가 없습니다**
 * (`REQ-04 · 4.9`). `P5` 가 `DETAIL_SCHEMAS` 를 탈출구 없는
 * `Record<ResourceType, …>` 로 만들어 둔 것이 여기서 값을 냅니다 —
 * 일곱 번째 타입을 추가하면 이 응답에 **자동으로** 들어갑니다.
 *
 * zod 4 의 `z.toJSONSchema()` 를 씁니다. 변환기를 따로 들이지 않습니다.
 *
 * ## 운영 설정을 반영합니다
 *
 * 관리자가 타입을 끄면(`DEC-032`) **CLI 에도 안 보여야** 합니다 —
 * 화면에서 감춘 타입을 에이전트가 계속 등록하면 그 설정이 무의미해집니다.
 */
export const GET = ingest("resources:read", async () => {
  const settings = await contentTypeService.listSettings();
  const active = settings.filter((t) => t.isActive);

  const data = active.map((t) => {
    return {
      code: t.code,
      label: t.label,
      slug: t.slug,
      description: t.description,
      /*
       * `io: "input"` — **폼이 보내는 모양**입니다. 우리 스키마는 문자열을
       * 받아 배열·숫자·`Date` 로 바꾸므로(`commaList`·`optionalInt`),
       * 출력 모양을 주면 에이전트가 **이미 변환된 값**을 보내려 합니다.
       */
      detailSchema: z.toJSONSchema(DETAIL_SCHEMAS[t.code], {
        io: "input",
        unrepresentable: "any",
      }),
    };
  });

  return json({ data });
});
