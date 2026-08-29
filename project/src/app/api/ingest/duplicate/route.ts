import { ingest, json } from "@/app/api/ingest/_lib/handler";
import { resourceRef } from "@/app/api/ingest/_lib/ref";
import { AppError } from "@/lib/errors";
import * as resourceWrite from "@/server/services/resource.write";

/**
 * API-103 중복 확인 (`FR-CLI-004`).
 *
 * **웹과 같은 정규화를 씁니다** — `normalizeUrl` 이 `www.`·추적 파라미터·
 * 끝 슬래시를 걷고 GitHub 주소는 `owner/repo` 까지 접습니다. 정규화가
 * 진입점마다 다르면 「웹에서는 중복인데 CLI 에서는 아닌」 자료가 생깁니다.
 *
 * ## 등록 «전에» 물어보라고 있는 것입니다
 *
 * `API-104` 는 중복을 `409` 로 거절합니다(`DEC-047`). 에이전트가 20개를
 * 루프로 밀어 넣기 전에 여기서 걸러내면 **거절이 아니라 건너뛰기**가 됩니다.
 */
export const GET = ingest("resources:read", async ({ url }) => {
  const target = url.searchParams.get("url");
  if (!target) {
    throw new AppError("VALIDATION_ERROR", "url 파라미터가 필요합니다.");
  }

  const normalized = resourceWrite.normalizeUrl(target);
  const hit = normalized ? await resourceWrite.findDuplicate(target) : null;

  return json({
    data: {
      /** 정규화 결과를 함께 줍니다 — 왜 같은 것으로 봤는지 보이게 */
      normalizedUrl: normalized ?? null,
      duplicate: hit ? resourceRef(hit) : null,
    },
  });
});
