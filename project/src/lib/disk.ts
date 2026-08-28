import "server-only";

import { statfs } from "node:fs/promises";

import { env } from "@/lib/env";

/**
 * 디스크 여유 확인 (NFR-BACKUP-007).
 *
 * 파일을 개발 PC 디스크에 보관하므로(`DEC-016`) 여유가 떨어지면
 * 업로드·아카이브를 **미리** 막아야 합니다. 다 차고 나서 실패하면
 * 부분 파일이 남고 원인도 늦게 드러납니다.
 */
export interface DiskStatus {
  freeBytes: number;
  freeGb: number;
  /** `DISK_MIN_FREE_GB` 이상 남았는가 */
  ok: boolean;
}

export async function getDiskStatus(
  path: string = env.STORAGE_ROOT
): Promise<DiskStatus> {
  // statfs 는 Node 18.15+ 에서 Windows 도 지원한다.
  const fs = await statfs(path);
  const freeBytes = fs.bavail * fs.bsize;
  const freeGb = freeBytes / 1024 ** 3;

  return {
    freeBytes,
    freeGb: Math.round(freeGb * 10) / 10,
    ok: freeGb >= env.DISK_MIN_FREE_GB,
  };
}
