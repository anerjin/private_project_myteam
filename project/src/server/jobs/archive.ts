import "server-only";

import { db } from "@/lib/db";
import { getDiskStatus } from "@/lib/disk";
import { AppError } from "@/lib/errors";
import { githubHeaders, tarballUrl } from "@/lib/github";
import * as storage from "@/lib/storage";
import { register } from "@/server/services/job.service";

/**
 * 소스 아카이브 (`FR-GH-003`, `DEC-022`).
 *
 * ## **자동으로 하지 않습니다**
 *
 * `DEC-022` 가 「선택 실행 + 총량 100GB」로 정했습니다. 등록할 때마다 받으면
 * 개발 PC 디스크가 며칠 만에 찹니다 — 사람이 「이건 남겨야 한다」고 판단한
 * 것만 받습니다.
 *
 * ## 커밋 SHA 를 기록하고, 같으면 다시 받지 않습니다
 *
 * `FR-GH-003` 수용 기준입니다. 그리고 그 SHA 가 **파일명에 들어가서**
 * 사용자가 무엇을 받았는지 알 수 있습니다 (`DEV-05` API-032).
 *
 * ## 받기 «전에» 막습니다
 *
 * 디스크 여유(`NFR-BACKUP-007`)와 아카이브 총량(`DEC-022`)을 먼저 봅니다.
 * 다 받은 뒤에 재면 이미 디스크를 쓴 뒤이고, 그때 지워도 그 사이에 다른
 * 쓰기가 실패할 수 있습니다.
 */

/** 아카이브 총량 상한 (`DEC-022`) — 80GB 에서 경고, 100GB 에서 거부 */
const TOTAL_LIMIT_BYTES = 100 * 1024 ** 3;

/** 지금까지 보관한 아카이브 총량 */
export async function archivedTotalBytes(): Promise<number> {
  const agg = await db.githubRepo.aggregate({
    _sum: { archiveSizeBytes: true },
  });
  return Number(agg._sum.archiveSizeBytes ?? 0);
}

async function run(job: { resourceId: string | null }) {
  if (!job.resourceId) {
    throw new AppError("INVALID_STATE", "대상 자료가 없는 작업입니다.");
  }

  const detail = await db.githubRepo.findUnique({
    where: { resourceId: job.resourceId },
    select: {
      owner: true,
      repo: true,
      defaultBranch: true,
      archivedSha: true,
      archiveSizeBytes: true,
      resource: { select: { authorId: true } },
    },
  });
  if (!detail) {
    throw new AppError("NOT_FOUND", "GitHub 상세 행이 없습니다.");
  }

  // ── 받기 전에 막는다 ──
  const disk = await getDiskStatus();
  if (!disk.ok) {
    throw new AppError(
      "INVALID_STATE",
      `디스크 여유가 부족해 아카이브를 받지 않습니다 (남은 용량 ${disk.freeGb}GB).`
    );
  }
  const total = await archivedTotalBytes();
  if (total >= TOTAL_LIMIT_BYTES) {
    throw new AppError(
      "INVALID_STATE",
      "아카이브 총량 100GB 상한에 닿았습니다. 관리자가 오래된 아카이브를 정리해야 합니다."
    );
  }

  /*
   * **기본 브랜치는 DB 에 있습니다.** 전에는 여기서 `fetchRepoMeta` 를 다시
   * 불렀는데, 그 함수는 안에서 `releases/latest` 까지 부르므로 **아카이브
   * 1건이 GitHub 호출 3회**를 썼습니다. 토큰 없이 시간당 60회면 아카이브
   * 20건이 한도 전부입니다.
   *
   * 메타를 아직 안 받았으면 `main` 으로 시도합니다 — GitHub 이 아니면 404 를
   * 주고, 그때 사람이 「메타 갱신」을 먼저 누르면 됩니다.
   */
  const ref = detail.defaultBranch ?? "main";

  await db.githubRepo.update({
    where: { resourceId: job.resourceId },
    data: { archiveStatus: "RUNNING" },
  });

  const res = await fetch(tarballUrl(detail.owner, detail.repo, ref), {
    headers: githubHeaders(),
    redirect: "follow",
  });
  if (!res.ok || !res.body) {
    await db.githubRepo.update({
      where: { resourceId: job.resourceId },
      data: { archiveStatus: "FAILED" },
    });
    throw new AppError(
      "UPSTREAM_ERROR",
      `아카이브를 받지 못했습니다 (HTTP ${res.status}).`
    );
  }

  /*
   * **실제로 받은 커밋은 리다이렉트된 주소 끝에 있습니다.**
   * `redirect: "follow"` 라 `res.url` 이 이미 손에 있고, 그 끝이 SHA 입니다
   * (`codeload.github.com/owner/repo/legacy.tar.gz/<sha>`).
   *
   * > 전에는 `etag` 를 긁고 **못 읽으면 브랜치 이름(`"main"`)** 을 썼습니다.
   * > 그러면 `archives/…/main.tar.gz` 로 저장되고 다음부터 `archivedSha ===
   * > "main"` 이 계속 참이라 **skip 이 영원히 걸립니다** — 「같으면 다시 받지
   * > 않는다」(`FR-GH-003`)가 「영영 다시 안 받는다」가 됩니다.
   * > 그래서 **못 읽으면 `null`** 로 둡니다: 파일은 받되 다음에 또 받습니다.
   */
  const sha = shaFromUrl(res.url);

  if (sha && detail.archivedSha === sha && detail.archiveSizeBytes) {
    await db.githubRepo.update({
      where: { resourceId: job.resourceId },
      data: { archiveStatus: "DONE" },
    });
    return { skipped: true, sha };
  }

  /*
   * **저장 키를 한 곳에서만 만듭니다.** 전에는 여기서 `meta.owner`(GitHub 정식
   * 표기)로 쓰고 다운로드 쪽은 `row.owner`(사용자가 적은 표기)로 조립해,
   * 대소문자가 다르면 **Windows 에서는 열리고 Linux 에서는 404** 였습니다.
   * 지금은 `files.storage_key` 가 정본이고 다운로드는 그 행을 읽습니다 —
   * `DEV-02 · 2.7` 이 *"정본은 files.size_bytes (role=ARCHIVE)"* 라고
   * 적어 둔 그 자리입니다.
   */
  const key = storage.newKey(
    `archives/${detail.owner}/${detail.repo}`,
    ".tar.gz"
  );
  let written;
  try {
    written = await storage.writeStream(
      key,
      res.body,
      storage.ARCHIVE_MAX_BYTES
    );
  } catch (e) {
    await db.githubRepo.update({
      where: { resourceId: job.resourceId },
      data: { archiveStatus: "FAILED" },
    });
    throw e;
  }

  const resourceId = job.resourceId;
  /** 트랜잭션이 끝난 뒤 지울 옛 파일 — **지역 변수여야 합니다**(동시 실행) */
  const staleKeys: string[] = [];

  await db.$transaction(async (tx) => {
    // 이전 아카이브 연결을 걷어낸다 — 자료당 아카이브는 하나다
    const old = await tx.resourceFile.findMany({
      where: { resourceId, role: "ARCHIVE" },
      select: { fileId: true, file: { select: { storageKey: true } } },
    });
    if (old.length) {
      await tx.resourceFile.deleteMany({
        where: { resourceId, role: "ARCHIVE" },
      });
      await tx.file.deleteMany({
        where: { id: { in: old.map((o) => o.fileId) } },
      });
    }

    const file = await tx.file.create({
      data: {
        storageKey: written.key,
        originalName: `${detail.owner}-${detail.repo}-${(sha ?? ref).slice(0, 7)}.tar.gz`,
        mimeType: "application/gzip",
        sizeBytes: BigInt(written.sizeBytes),
        checksumSha256: written.sha256,
        // 「올린 사람」은 자료의 등록자다 — 아카이브는 그 자료에 딸린 것이다
        uploadedById: detail.resource.authorId,
      },
      select: { id: true },
    });
    await tx.resourceFile.create({
      data: { resourceId, fileId: file.id, role: "ARCHIVE" },
    });

    await tx.githubRepo.update({
      where: { resourceId },
      data: {
        archiveStatus: "DONE",
        archivedSha: sha,
        // 표시용 캐시 — 정본은 위 `files.size_bytes` (`DEV-02 · 2.7`)
        archiveSizeBytes: BigInt(written.sizeBytes),
      },
    });

    // 오래된 파일은 트랜잭션 «밖에서» 지운다 (롤백돼도 파일만 사라지면 안 된다)
    staleKeys.push(...old.map((o) => o.file.storageKey));
  });

  for (const k of staleKeys) await storage.remove(k).catch(() => {});

  return { sha, sizeBytes: written.sizeBytes, key: written.key };
}

/**
 * `codeload.github.com/owner/repo/legacy.tar.gz/<sha>` 의 끝.
 * SHA 모양이 아니면 **`null`** — 「모른다」를 「main」으로 바꾸면 안 됩니다.
 */
function shaFromUrl(url: string): string | null {
  const last = url.split("?")[0].split("/").pop() ?? "";
  return /^[0-9a-f]{7,40}$/i.test(last) ? last : null;
}

register("ARCHIVE_GITHUB", run);
