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
  /** 임계치 이상 남았는가 */
  ok: boolean;
  /** 그 임계치가 얼마였는지 — 화면이 「20GB 미만」이라고 «말할» 수 있어야 합니다 */
  minFreeGb: number;
}

/**
 * **임계치를 인자로 받습니다.**
 *
 * `lib` 은 `server/services` 를 import 하지 않습니다(`check-deps`). 그런데
 * 임계치는 이제 관리자가 바꿀 수 있어(`FR-ADM-015`) `settings.service` 가
 * 압니다 — 그래서 방향을 뒤집어 **부르는 쪽이 값을 넘깁니다.**
 * 안 넘기면 `.env` 값이고, 그건 설정을 한 번도 안 건드린 상태와 같습니다.
 */
export async function getDiskStatus(
  minFreeGb: number = env.DISK_MIN_FREE_GB,
  path: string = env.STORAGE_ROOT
): Promise<DiskStatus> {
  // statfs 는 Node 18.15+ 에서 Windows 도 지원한다.
  const fs = await statfs(path);
  const freeBytes = fs.bavail * fs.bsize;
  const freeGb = freeBytes / 1024 ** 3;

  return {
    freeBytes,
    freeGb: Math.round(freeGb * 10) / 10,
    ok: freeGb >= minFreeGb,
    minFreeGb,
  };
}
