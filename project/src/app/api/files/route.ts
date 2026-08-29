import { AppError } from "@/lib/errors";
import { requireActor } from "@/server/auth/guards";
import * as fileService from "@/server/services/file.service";

/**
 * API-040 파일 첨부 업로드 (`FR-FILE-001`).
 *
 * ## multipart 가 아니라 **본문 그대로** 받습니다
 *
 * `DEV-05` 는 「multipart 스트리밍」으로 적었지만, Next 의 `request.formData()`
 * 는 **파일 전체를 메모리에 올립니다** — `NFR-PERF-007` 이 막는 바로 그것입니다.
 * 직접 파싱하려면 경계 문자열 처리를 손으로 쓰거나 라이브러리를 들여야 하고,
 * 둘 다 「한 번에 파일 하나」인 이 화면에는 과합니다.
 *
 * 그래서 **파일을 본문에 그대로** 싣고 이름·형식은 헤더로 받습니다.
 * `fetch(url, { method: "POST", body: file, headers: { … } })` 한 줄이고
 * 브라우저가 알아서 스트리밍합니다.
 *
 * ```
 * POST /api/files?resourceId=…
 *   x-filename: 보고서.pdf        (RFC 5987 인코딩)
 *   content-type: application/pdf
 *   <바이트 그대로>
 * ```
 *
 * 여러 개를 올릴 때는 **클라이언트가 순서대로 여러 번** 부릅니다 — 진행률을
 * 파일마다 보여줄 수 있어 오히려 낫습니다.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const actor = await requireActor();

    const url = new URL(req.url);
    const resourceId = url.searchParams.get("resourceId");
    if (!resourceId) {
      throw new AppError("VALIDATION_ERROR", "대상 자료가 없습니다.");
    }

    const raw = req.headers.get("x-filename");
    if (!raw) {
      throw new AppError("VALIDATION_ERROR", "파일 이름이 없습니다.");
    }
    // 한글 파일명이 헤더에 그대로 못 들어가므로 인코딩해서 받습니다
    const filename = safeDecode(raw);
    if (!req.body) {
      throw new AppError("VALIDATION_ERROR", "파일 내용이 없습니다.");
    }

    const attachment = await fileService.attach(actor, {
      resourceId,
      filename,
      contentType: req.headers.get("content-type") ?? "",
      body: req.body,
    });

    return Response.json({ data: attachment }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/**
 * `AppError` 를 `DEV-05 · 5.2` 의 응답 모양으로.
 *
 * **라우트는 `guard()` 를 쓸 수 없습니다** — 그건 Server Action 의 결과 객체를
 * 만들고, 여기서는 HTTP 상태 코드가 필요합니다.
 */
function errorResponse(e: unknown): Response {
  const STATUS: Record<string, number> = {
    UNAUTHENTICATED: 401,
    ACCOUNT_PENDING: 403,
    ACCOUNT_BLOCKED: 403,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    VALIDATION_ERROR: 422,
    DUPLICATE: 409,
    INVALID_STATE: 409,
    RATE_LIMITED: 429,
    PAYLOAD_TOO_LARGE: 413,
    UPSTREAM_ERROR: 502,
  };
  if (e instanceof AppError) {
    return Response.json(
      { error: { code: e.code, message: e.message } },
      { status: STATUS[e.code] ?? 500 }
    );
  }
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "처리 중 문제가 발생했습니다." } },
    { status: 500 }
  );
}
