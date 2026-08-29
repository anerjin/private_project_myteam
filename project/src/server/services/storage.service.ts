import "server-only";

import { db } from "@/lib/db";
import { getDiskStatus, type DiskStatus } from "@/lib/disk";
import * as settingsService from "@/server/services/settings.service";

/**
 * 스토리지 사용량 (`FR-FILE-006`, `DEC-022`).
 *
 * ## 상한이 **여기 한 곳**에 있습니다
 *
 * 전에는 `server/jobs/archive.ts` 안에 `TOTAL_LIMIT_BYTES` 가 있었고,
 * 그것을 **보여주는 화면이 없었습니다** — 아카이브를 100GB 까지 받다가
 * 어느 날 갑자기 「상한에 닿았습니다」로 거부당하고, 관리자는 그때까지
 * 얼마나 찼는지 볼 방법이 없었습니다. 게이지와 차단이 **같은 숫자**를 봐야
 * 게이지가 경고 역할을 합니다.
 *
 * ## 파일 크기를 디스크에서 세지 않습니다
 *
 * `files.size_bytes` 와 `github_repos.archive_size_bytes` 를 씁니다.
 * 디렉터리를 훑으면 파일 수에 비례해 느려지고, 무엇보다 **DB 가 모르는
 * 파일까지 세어** 「어디서 온 건지 알 수 없는 용량」이 생깁니다.
 * 둘이 어긋난다면 그것은 고아 파일이고, 그건 정리 작업이 다룰 문제입니다.
 */

/** 아카이브 총량 상한 (`DEC-022`) — 80% 에서 경고, 100GB 에서 거부 */
export const ARCHIVE_LIMIT_BYTES = 100 * 1024 ** 3;

/** 이 비율을 넘으면 화면이 경고합니다 — 「거부당하고 나서 아는 것」을 막습니다 */
export const ARCHIVE_WARN_RATIO = 0.8;

/** 지금까지 보관한 아카이브 총량 */
export async function archivedTotalBytes(): Promise<number> {
  const agg = await db.githubRepo.aggregate({
    _sum: { archiveSizeBytes: true },
  });
  return Number(agg._sum.archiveSizeBytes ?? 0);
}

export interface StorageUsage {
  disk: DiskStatus;
  archive: {
    bytes: number;
    limitBytes: number;
    ratio: number;
    /** 상한의 80% 를 넘었는가 */
    warn: boolean;
    /** 상한에 닿아 **새 아카이브가 거부되는가** */
    full: boolean;
    count: number;
  };
  attachments: {
    bytes: number;
    count: number;
  };
}

/**
 * 관리 화면이 한 번에 묻는 값 (`FR-FILE-006`).
 *
 * **첨부와 아카이브를 나눠 셉니다.** 합쳐 놓으면 「용량이 찼다」고만 알 뿐
 * 무엇을 정리해야 하는지 모릅니다 — 상한이 걸린 쪽은 아카이브이고,
 * 첨부는 개별 50MB 제한만 있습니다.
 */
export async function usage(): Promise<StorageUsage> {
  const [disk, archiveBytes, archiveCount, attachments] = await Promise.all([
    settingsService.minFreeGb().then((gb) => getDiskStatus(gb)),
    archivedTotalBytes(),
    db.githubRepo.count({ where: { archiveSizeBytes: { gt: 0 } } }),
    /*
     * **`role` 은 `files` 가 아니라 `resource_files` 에 있습니다** — 같은 파일이
     * 자료마다 다른 역할로 붙을 수 있기 때문입니다. 그래서 관계를 타고 거릅니다.
     */
    db.file.aggregate({
      where: { resources: { some: { role: "ATTACHMENT" } } },
      _sum: { sizeBytes: true },
      _count: true,
    }),
  ]);

  const ratio = archiveBytes / ARCHIVE_LIMIT_BYTES;
  return {
    disk,
    archive: {
      bytes: archiveBytes,
      limitBytes: ARCHIVE_LIMIT_BYTES,
      ratio,
      warn: ratio >= ARCHIVE_WARN_RATIO,
      full: archiveBytes >= ARCHIVE_LIMIT_BYTES,
      count: archiveCount,
    },
    attachments: {
      bytes: Number(attachments._sum?.sizeBytes ?? 0),
      count: attachments._count ?? 0,
    },
  };
}
