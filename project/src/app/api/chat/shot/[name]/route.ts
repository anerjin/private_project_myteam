import { streamFile } from "@/app/api/_lib/file-response";
import { AppError } from "@/lib/errors";
import { requireActor } from "@/server/auth/guards";
import { SHOTS_PREFIX, isShotName } from "@/server/services/chat.service";

/**
 * 디오가 찍은 화면 캡처를 답 안에 그려 주기 위한 길.
 *
 * ## 왜 필요한가
 *
 * 디오의 브라우저는 **서버 PC 안**에서 돕니다. 사내망으로 들어온 팀원은
 * 그 창을 볼 수 없습니다 — 실제로 운영자가 「브라우저를 못 띄우는데?」라고
 * 물었고, 디오는 「캡처해서 보여 드릴 수 있습니다」라고 답했는데 **그럴
 * 길이 없었습니다.** 약속만 있고 코드가 없던 자리입니다.
 *
 * ## 아무 파일이나 열어 주지 않습니다
 *
 * 이름을 **`[A-Za-z0-9._-]` 와 `.png`/`.jpg` 로 한정**하고(`isShotName`),
 * 저장 키는 `chat-shots/<이름>` 으로 **서버가 조립**합니다. 경로 조립은
 * `storage.resolve` 가 한 번 더 봅니다 (`NFR-SEC-019`).
 *
 * 로그인은 필수입니다 — 캡처에는 디오가 본 페이지가 그대로 들어 있습니다.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ name: string }> }
): Promise<Response> {
  try {
    await requireActor();
    const { name } = await ctx.params;
    const decoded = decodeURIComponent(name);
    if (!isShotName(decoded)) {
      throw new AppError("VALIDATION_ERROR", "잘못된 파일 이름입니다.");
    }
    return streamFile(req, {
      storageKey: `${SHOTS_PREFIX}/${decoded}`,
      filename: decoded,
      mimeType: decoded.endsWith(".png") ? "image/png" : "image/jpeg",
      // 브라우저가 «내려받기»가 아니라 «그리기»를 하게 합니다
      inline: true,
    });
  } catch (e) {
    if (e instanceof AppError) {
      const status =
        e.code === "UNAUTHENTICATED"
          ? 401
          : e.code === "NOT_FOUND"
            ? 404
            : e.code === "VALIDATION_ERROR"
              ? 400
              : 403;
      return new Response(e.message, { status });
    }
    return new Response("처리 중 문제가 발생했습니다.", { status: 500 });
  }
}
