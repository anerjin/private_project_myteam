import "server-only";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/server/auth/actor";
import { draftScope } from "@/server/services/file.service";

/**
 * GitHub 자료의 아카이브 상태 (`FR-GH-003`·`004`).
 *
 * 라우트가 Prisma 를 직접 부르지 않게 여기 둡니다 (`DEV-06 · 6.6`) —
 * `check-deps` 의 `app → db` 규칙이 그것을 막고, 실제로 잡혔습니다.
 */

export interface ArchiveDownload {
  storageKey: string;
  filename: string;
  sizeBytes: number;
}

/**
 * 내려받을 수 있는 아카이브. 아니면 **왜 안 되는지**를 담아 던집니다.
 *
 * 「아직 없다」와 「없다」를 구별합니다 — 실행 중이면 기다리면 되고,
 * 안 만들었으면 상세 화면에서 실행해야 합니다. 같은 404 로 뭉뚱그리면
 * 사람이 무엇을 해야 할지 모릅니다.
 */
export async function archiveForDownload(
  resourceId: string,
  viewer: Actor
): Promise<ArchiveDownload> {
  // 초안의 아카이브도 새면 안 된다 — `file.service` 와 같은 규칙
  const row = await db.githubRepo.findFirst({
    where: {
      resourceId,
      resource: { deletedAt: null, ...draftScope(viewer) },
    },
    select: { archiveStatus: true },
  });
  if (!row) throw new AppError("NOT_FOUND", "자료를 찾을 수 없습니다.");

  /*
   * **저장 키를 여기서 조립하지 않습니다.**
   *
   * 전에는 `archives/${row.owner}/${row.repo}/${sha}.tar.gz` 를 만들었는데,
   * 쓰는 쪽(`jobs/archive.ts`)은 **GitHub 응답의 정식 표기**로 만들고 여기는
   * **DB 값**(사용자가 적은 표기)으로 만들었습니다. 메타 수집이 rate limit 으로
   * 실패하면 둘이 갈리고 — **Windows 에서는 우연히 열리고 Linux 에서는 404**
   * 입니다. 저장소 이름이 GitHub 에서 바뀌어도 같습니다.
   *
   * 지금은 `files.storage_key` 가 정본입니다 (`DEV-02 · 2.7`).
   */
  const link = await db.resourceFile.findFirst({
    where: { resourceId, role: "ARCHIVE" },
    select: {
      file: {
        select: { storageKey: true, originalName: true, sizeBytes: true },
      },
    },
  });

  if (!link) {
    throw new AppError(
      "INVALID_STATE",
      row.archiveStatus === "RUNNING" || row.archiveStatus === "QUEUED"
        ? "아카이브를 만드는 중입니다. 잠시 뒤에 다시 시도해 주세요."
        : "이 저장소는 아직 아카이브하지 않았습니다. 자료 상세에서 실행할 수 있습니다."
    );
  }

  return {
    storageKey: link.file.storageKey,
    // 받은 사람이 **무엇을 받았는지** 알아야 한다 (`DEV-05 · 5.5`)
    filename: link.file.originalName,
    sizeBytes: Number(link.file.sizeBytes),
  };
}
