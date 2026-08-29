import { ingest, json } from "@/app/api/ingest/_lib/handler";
import { resourceRef, resourceUrl } from "@/app/api/ingest/_lib/ref";
import { parseResourceInput } from "@/features/resources/form.schema";
import { AppError } from "@/lib/errors";
import "@/server/jobs";
import * as jobService from "@/server/services/job.service";
import * as resourceWrite from "@/server/services/resource.write";

/**
 * API-104 자료 등록 (`FR-CLI-005`).
 *
 * ## 웹과 **같은 service·같은 zod** 를 지납니다 (`NFR-SEC-018`)
 *
 * `parseResourceInput` 은 폼이 쓰는 것 그대로입니다. 그래서 `P5` 가 만든
 * 타입 6종 검증이 **CLI 에도 자동으로** 적용되고, `API-100` 이 내려준
 * JSON Schema 와 실제 검증이 갈리지 않습니다.
 *
 * ## 중복은 여기서 **거절**합니다 (`DEC-047`)
 *
 * 웹은 「그대로 등록」을 허용합니다 — 사람이 배너를 보고 **의식하고** 고르니까요.
 * 에이전트는 20개 URL 루프를 돌며 **조용히** 중복을 만들 수 있으므로 `409` 입니다.
 * 한 DB 제약이 두 정책을 낼 수 없어 **그 비대칭이 라우트에** 있습니다.
 *
 * 거절 문구에 **기존 자료를 실어 보냅니다** — 에이전트가 「이미 있으니
 * 건너뛴다」를 판단하려면 무엇과 겹쳤는지 알아야 합니다 (`FR-CLI-010`).
 */
export const POST = ingest("resources:write", async ({ actor, req }) => {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    throw new AppError("VALIDATION_ERROR", "JSON 본문이 필요합니다.");
  }

  const parsed = parseResourceInput(body);
  if (!parsed.ok) {
    throw new AppError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요. GET /api/ingest/content-types 의 스키마를 참고하십시오.",
      parsed.fieldErrors
    );
  }

  if (parsed.data.url) {
    const dup = await resourceWrite.findDuplicate(parsed.data.url);
    if (dup) {
      /*
       * **기존 자료를 «본문에» 담아 돌려줍니다** (`DEV-05 · 5.11` 규칙 표:
       * 「중복은 오류가 아니라 정보다 — `409` 와 함께 기존 자료를 담아 준다」).
       * 문구 안에만 적으면 에이전트가 문장을 파싱해야 하고, 그건 문구를
       * 고치는 순간 깨집니다.
       */
      return json(
        {
          error: {
            code: "DUPLICATE",
            message: `이미 등록된 자료입니다: ${dup.title}. 보강이 필요하면 PATCH /api/ingest/resources/${dup.id} 를 쓰십시오.`,
          },
          data: { duplicate: resourceRef(dup) },
        },
        409
      );
    }
  }

  const result = await resourceWrite.create(actor, parsed.data);

  /*
   * **등록 경로가 `MCP` 로 남습니다** (`FR-CLI-005`). `actor.via` 가
   * `resource.write` 안에서 `sourceChannel` 이 됩니다 — 라우트가 따로 넘기지
   * 않습니다. `DEC-029` 가 검수를 폐기하며 「구분은 `source_channel` 이
   * 한다」로 정했고, 그 값이 여기서 채워집니다.
   */
  const queuedJobs: string[] = [];
  if (result.type === "GITHUB_REPO") {
    await jobService.enqueueAndRun({
      type: "FETCH_GITHUB_META",
      resourceId: result.id,
      requestedById: actor.id,
    });
    queuedJobs.push("FETCH_GITHUB_META");
  }
  /*
   * **`FETCH_URL_META` 는 여기에 없습니다.** `DEV-05 · 5.11` 6번은 그것도
   * 건다고 적었지만 그 작업의 **핸들러가 아직 없습니다**(`REQ-04` 의 작업 표에는
   * 있고 「URL 빠른 등록」(`FR-RES-005`)의 몫인데 `P5` 가 타입 추정까지만
   * 만들었습니다). 걸어 두면 `QUEUED` 로 영원히 남고, 응답의 `queuedJobs` 는
   * **돌지 않는 작업의 이름**을 말하게 됩니다 — `OPEN-018` 로 남깁니다.
   * 여기 목록은 **실제로 건 것만** 담습니다.
   */

  return json(
    {
      data: {
        id: result.id,
        slug: result.slug,
        type: result.type,
        /*
         * **절대 URL 입니다** (`DEV-05 · 5.11` 규칙 표: 「사람이 바로 열어
         * 확인할 수 있어야 한다」). 상대 경로는 CLI 로그에서 못 엽니다.
         */
        url: resourceUrl(result.type, result.slug),
        queuedJobs,
      },
    },
    201
  );
});
