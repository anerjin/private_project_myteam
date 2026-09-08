import { streamFile } from "@/app/api/_lib/file-response";
import { AppError } from "@/lib/errors";
import { requireActor } from "@/server/auth/guards";
import * as fileService from "@/server/services/file.service";

/**
 * API-042 첨부 다운로드 (`FR-FILE-002`, `NFR-SEC-021`).
 *
 * **로그인·권한을 거친 요청만** 파일을 받습니다. `public/` 에 두지 않는
 * 이유이고, 그래서 이 라우트가 **유일한 관문**입니다 — `requireActor()` 가
 * 첫 줄에 있어야 합니다.
 *
 * ⚠️ `DEC-077` 이전에는 `fileService.forDownload(id, actor)` 로 `Actor` 를 넘겨
 *    service 가 초안 범위를 한 번 더 봤습니다. 그 범위가 사라져 인자도 사라졌고,
 *    **로그인 판정이 이 한 줄에만** 남았습니다. 지우지 마십시오.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    await requireActor();
    const { id } = await ctx.params;
    const file = await fileService.forDownload(id);
    return streamFile(req, {
      storageKey: file.storageKey,
      filename: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    });
  } catch (e) {
    if (e instanceof AppError) {
      const status =
        e.code === "UNAUTHENTICATED" ? 401 : e.code === "NOT_FOUND" ? 404 : 403;
      return new Response(e.message, { status });
    }
    return new Response("처리 중 문제가 발생했습니다.", { status: 500 });
  }
}
