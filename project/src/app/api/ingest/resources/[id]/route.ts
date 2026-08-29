import { ingest, json } from "@/app/api/ingest/_lib/handler";
import { parseResourceInput } from "@/features/resources/form.schema";
import { AppError } from "@/lib/errors";
import * as resourceService from "@/server/services/resource.service";
import * as resourceWrite from "@/server/services/resource.write";

/** API-102 자료 상세 — 타입별 상세까지 (`FR-CLI-003` 의 뒷단) */
export const GET = ingest("resources:read", async ({ actor, url }) => {
  const id = url.pathname.split("/").pop()!;
  const r = await resourceService.getById(id, actor.id, actor.role);
  return json({
    data: {
      id: r.id,
      type: r.type,
      slug: r.slug,
      title: r.title,
      summary: r.summary,
      body: r.body,
      url: r.url,
      category: r.category,
      tags: r.tags,
      author: r.author.username,
      sourceChannel: r.sourceChannel,
      detail: r.detail,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    },
  });
});

/**
 * API-105 자료 수정 (`FR-CLI-006`).
 *
 * **보강**이 목적입니다 — 에이전트가 나중에 더 찾은 내용을 얹습니다.
 * 소유권은 service 가 봅니다(`canEditResource`) — 남의 자료는 `EDITOR` 이상만.
 *
 * `parseResourceInput` 이 **전체 입력**을 받으므로 부분 수정이 아닙니다.
 * 그래서 먼저 지금 값을 읽어 합칩니다 — 그러지 않으면 한 칸을 고치려다
 * 나머지가 지워집니다(`P5` 에서 실측한 `upsert.update` 의 그 함정과 같은 자리).
 */
export const PATCH = ingest("resources:write", async ({ actor, req, url }) => {
  const id = url.pathname.split("/").pop()!;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    throw new AppError("VALIDATION_ERROR", "JSON 본문이 필요합니다.");
  }

  const current = await resourceService.getById(id, actor.id, actor.role);
  const merged = {
    title: current.title,
    summary: current.summary ?? "",
    url: current.url ?? "",
    body: current.body ?? "",
    category: current.category ?? "",
    tags: current.tags.join(", "),
    // 타입 상세는 지금 값을 펼쳐 두고 보낸 것만 덮는다
    ...stripType(current.detail),
    ...(body as Record<string, unknown>),
    // **타입은 못 바꿉니다** — 상세 테이블이 갈립니다 (`P4` 의 판단).
    // 마지막에 두어 본문이 무엇을 보내든 이깁니다.
    type: current.type,
  };

  const parsed = parseResourceInput(merged);
  if (!parsed.ok) {
    throw new AppError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      parsed.fieldErrors
    );
  }

  await resourceWrite.update(actor, id, parsed.data);
  return json({ data: { id, updated: true } });
});

/** `detail` 의 판별자(`type`)를 뺀 나머지 — 그대로 두면 위 `type` 과 싸운다 */
function stripType(detail: object): Record<string, unknown> {
  const { type: _drop, ...rest } = detail as Record<string, unknown>;
  void _drop;
  return rest;
}
