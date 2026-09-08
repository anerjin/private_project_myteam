import "server-only";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { RepoFile } from "@/types";

/**
 * GitHub 자료의 아카이브 상태 (`FR-GH-003`·`004`).
 *
 * 라우트가 Prisma 를 직접 부르지 않게 여기 둡니다 (`DEV-06 · 6.6`) —
 * `check-deps` 의 `app → db` 규칙이 그것을 막고, 실제로 잡혔습니다.
 */

export interface ArchiveDownload {
  storageKey: string;
  filename: string;
  /** `files.mime_type` — tarball 도 있고 `.mhtml` 도 있습니다 */
  mimeType: string;
  sizeBytes: number;
}

/** 상세 화면의 왼쪽 — GitHub 첫 화면처럼 파일 목록과 README */
export interface RepoView {
  files: RepoFile[];
  readme: string | null;
}

/**
 * 상세 화면 «전용» 읽기.
 *
 * **목록 select 에 넣지 않았습니다.** `readme_content` 는 최대 200KB 이고
 * `file_tree` 도 수십 줄인데, 카드는 둘 다 안 그립니다 — `githubRepo: true`
 * 로 두면 목록 한 쪽(24행)이 그걸 전부 끌고 옵니다.
 *
 * 🔄 초안 범위(`file.service.draftScope`)를 함께 걸었습니다. `DEC-077` 로 그
 *    범위가 없어져 **`viewer` 인자가 사라졌습니다** — 부르는 쪽(상세 화면)의
 *    `requireActiveUser()` 가 그대로 문입니다.
 */
export async function repoView(resourceId: string): Promise<RepoView> {
  const row = await db.githubRepo.findFirst({
    where: {
      resourceId,
      resource: { deletedAt: null },
    },
    select: { fileTree: true, readmeContent: true },
  });
  if (!row) return { files: [], readme: null };

  /*
   * **`as` 로 뭉개지 않습니다.** `json` 컬럼에는 런타임에 무엇이든 들어올 수
   * 있고(예전 형태, 손으로 넣은 값), 형태가 어긋나면 화면에서 터집니다 —
   * `resource.mapper` 의 `json()` 이 같은 이유로 배열 검사를 합니다.
   */
  const files: RepoFile[] = Array.isArray(row.fileTree)
    ? (row.fileTree as unknown[]).flatMap((raw) => {
        if (typeof raw !== "object" || raw === null) return [];
        const f = raw as Record<string, unknown>;
        if (typeof f.name !== "string") return [];
        if (f.type !== "file" && f.type !== "dir") return [];
        // 저장할 때 `null` 로 폈던 것을 되돌립니다
        return [
          {
            name: f.name,
            type: f.type,
            size: typeof f.size === "number" ? f.size : undefined,
          },
        ];
      })
    : [];

  return { files, readme: row.readmeContent };
}

/**
 * 보관본이 있는가 — 상세 화면이 「보관됨 · N MB」를 그릴 때 씁니다.
 *
 * `file.service.listFor` 는 **`ATTACHMENT` 만** 봅니다(첨부 목록이니까).
 * 보관본은 `role=ARCHIVE` 라 거기 안 잡힙니다.
 */
export async function archivedFile(
  resourceId: string
): Promise<{ name: string; sizeBytes: number } | null> {
  const link = await db.resourceFile.findFirst({
    where: { resourceId, role: "ARCHIVE" },
    select: { file: { select: { originalName: true, sizeBytes: true } } },
  });
  return link
    ? {
        name: link.file.originalName,
        sizeBytes: Number(link.file.sizeBytes),
      }
    : null;
}

/**
 * 내려받을 수 있는 아카이브. 아니면 **왜 안 되는지**를 담아 던집니다.
 *
 * 「아직 없다」와 「없다」를 구별합니다 — 실행 중이면 기다리면 되고,
 * 안 만들었으면 상세 화면에서 실행해야 합니다. 같은 404 로 뭉뚱그리면
 * 사람이 무엇을 해야 할지 모릅니다.
 */
export async function archiveForDownload(
  resourceId: string
): Promise<ArchiveDownload> {
  /*
   * **GitHub 자료만 받을 수 있었습니다.**
   *
   * `github_repos` 행이 없으면 그냥 「자료를 찾을 수 없습니다」였습니다. 그런데
   * 이제 문서 사이트·논문도 보관합니다(`ARCHIVE_URL`) — 그것들에는 그 행이
   * 없습니다. **보관본은 `files(role=ARCHIVE)` 에 있고**, 그건 타입과 무관합니다.
   *
   * 🔄 초안의 보관본도 막았습니다 — `DEC-077` 로 그 범위가 없어졌습니다.
   *    막는 것은 라우트의 `requireActor()` 입니다.
   */
  const resource = await db.resource.findFirst({
    where: { id: resourceId, deletedAt: null },
    select: { githubRepo: { select: { archiveStatus: true } } },
  });
  if (!resource) throw new AppError("NOT_FOUND", "자료를 찾을 수 없습니다.");
  const repo = resource.githubRepo;

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
        select: {
          storageKey: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
        },
      },
    },
  });

  if (!link) {
    throw new AppError(
      "INVALID_STATE",
      repo?.archiveStatus === "RUNNING" || repo?.archiveStatus === "QUEUED"
        ? "아카이브를 만드는 중입니다. 잠시 뒤에 다시 시도해 주세요."
        : "아직 보관하지 않았습니다. 자료 상세에서 실행할 수 있습니다."
    );
  }

  return {
    storageKey: link.file.storageKey,
    // 받은 사람이 **무엇을 받았는지** 알아야 한다 (`DEV-05 · 5.5`)
    filename: link.file.originalName,
    mimeType: link.file.mimeType,
    sizeBytes: Number(link.file.sizeBytes),
  };
}
