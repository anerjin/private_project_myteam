import { ingest, json } from "@/app/api/ingest/_lib/handler";
import { AppError } from "@/lib/errors";
import "@/server/jobs";
import * as jobService from "@/server/services/job.service";
import * as resourceService from "@/server/services/resource.service";

/**
 * API-107 아카이브 작업 요청 (`FR-CLI-008`).
 *
 * **`archive:run` 스코프가 필요합니다** — 키마다 줄지 말지 고릅니다
 * (`REQ-02 · 2.2`, `NFR-SEC-017`). 아카이브는 최대 500MB 를 디스크에 쓰므로
 * 「자료를 등록할 수 있다」와 같은 등급이 아닙니다.
 *
 * 작업만 만들고 **바로 돌아옵니다.** 에이전트가 기다릴 일이 아니고,
 * 진행 상황은 `admin/jobs` 가 보여줍니다 (`DEC-053`).
 */
export const POST = ingest("archive:run", async ({ actor, url }) => {
  const parts = url.pathname.split("/");
  const id = parts[parts.length - 2];

  const r = await resourceService.getById(id, actor.id);
  if (r.type !== "GITHUB_REPO") {
    throw new AppError("INVALID_STATE", "GitHub 저장소 자료가 아닙니다.");
  }
  /*
   * 🔄 `canEditResource(actor, r.author.id)` 가 여기 있었습니다. `DEC-077` 로
   *    등급이 사라져 **문은 `archive:run` 스코프 하나**입니다 — 그 스코프를 준
   *    키만 여기까지 옵니다(`_lib/handler` 의 `assertScope`).
   */

  const job = await jobService.enqueueAndRun({
    type: "ARCHIVE_GITHUB",
    resourceId: id,
    requestedById: actor.id,
  });

  return json({ data: { jobId: job.id, status: "QUEUED" } }, 202);
});
