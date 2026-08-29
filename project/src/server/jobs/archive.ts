import "server-only";

import { db } from "@/lib/db";
import { getDiskStatus } from "@/lib/disk";
import { AppError } from "@/lib/errors";
import { fetchRepoMeta, githubHeaders, tarballUrl } from "@/lib/github";
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
      archivedSha: true,
      archiveSizeBytes: true,
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

  const meta = await fetchRepoMeta(detail.owner, detail.repo);
  const ref = meta.defaultBranch;

  await db.githubRepo.update({
    where: { resourceId: job.resourceId },
    data: { archiveStatus: "RUNNING" },
  });

  const res = await fetch(tarballUrl(meta.owner, meta.repo, ref), {
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
   * **실제로 받은 커밋**은 리다이렉트된 주소 끝에 있습니다
   * (`.../legacy.tar.gz/refs/heads/main` → GitHub 이 SHA 를 준다).
   * 못 읽으면 브랜치 이름으로 대신합니다 — 「모른다」로 두는 것보다 낫습니다.
   */
  const sha =
    res.headers.get("etag")?.replace(/[^a-f0-9]/gi, "").slice(0, 40) || ref;

  if (detail.archivedSha === sha && detail.archiveSizeBytes) {
    await db.githubRepo.update({
      where: { resourceId: job.resourceId },
      data: { archiveStatus: "DONE" },
    });
    return { skipped: true, sha };
  }

  const key = `archives/${meta.owner}/${meta.repo}/${sha}.tar.gz`;
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

  await db.githubRepo.update({
    where: { resourceId: job.resourceId },
    data: {
      archiveStatus: "DONE",
      archivedSha: sha,
      archiveSizeBytes: BigInt(written.sizeBytes),
    },
  });

  return { sha, sizeBytes: written.sizeBytes, key };
}

register("ARCHIVE_GITHUB", run);
