import { streamFile } from "@/app/api/_lib/file-response";
import { AppError } from "@/lib/errors";
import { requireActor } from "@/server/auth/guards";
import * as githubService from "@/server/services/github.service";

/**
 * API-032 아카이브 다운로드 (`FR-GH-004`).
 *
 * `Range` 는 `streamFile` 이 처리합니다. 500MB 를 받다 끊기면 처음부터 다시
 * 받아야 하는데, 개발 PC 를 서버로 쓰는 1단계에서는 그 일이 실제로 일어납니다.
 *
 * > 처음엔 여기서 Prisma 를 직접 불렀고 **`check-deps` 의 `app → db` 규칙이
 * > 잡았습니다.** `P4` 에서 그 규칙을 세울 때 「화면」만 생각했는데 라우트도
 * > 같은 이유로 막혀야 합니다 — 조회 조건이 진입점마다 갈립니다.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const actor = await requireActor();
    const { id } = await ctx.params;
    const archive = await githubService.archiveForDownload(id, actor);
    /*
     * **형식을 여기서 정하지 않습니다.**
     *
     * `application/gzip` 이 박혀 있었습니다 — 아카이브가 GitHub tarball 뿐이던
     * 시절의 값입니다. 이제 웹 페이지 보관본(`.mhtml`)도 같은 문으로 나가는데,
     * 그것을 gzip 이라고 말하면 **브라우저가 압축 파일로 취급**합니다.
     * 정본은 `files.mime_type` 이고, 쓴 쪽이 그때 정한 값입니다.
     */
    return streamFile(req, {
      storageKey: archive.storageKey,
      filename: archive.filename,
      mimeType: archive.mimeType,
      sizeBytes: archive.sizeBytes,
    });
  } catch (e) {
    if (e instanceof AppError) {
      const status =
        e.code === "UNAUTHENTICATED"
          ? 401
          : e.code === "NOT_FOUND"
            ? 404
            : e.code === "INVALID_STATE"
              ? 409
              : 403;
      return new Response(e.message, { status });
    }
    return new Response("처리 중 문제가 발생했습니다.", { status: 500 });
  }
}
