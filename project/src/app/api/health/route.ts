import { constants } from "node:fs";
import { access } from "node:fs/promises";

import { env } from "@/lib/env";
import { getDiskStatus } from "@/lib/disk";

/**
 * API-090 헬스 체크 (DEV-01 · 1.11절, NFR-AVAIL-002).
 *
 * **P0 단계에서는 `env`·`storage`·`disk` 만 봅니다.** `db`·`redis` 는 컨테이너가
 * 올라오는 P1에서 붙입니다. 항목을 미리 `"ok"` 로 적어두면 확인하지 않은 것을
 * 확인한 것처럼 보고하게 되므로, **아직 없는 검사는 목록에 넣지 않습니다.**
 */

export const dynamic = "force-dynamic";

type CheckState = "ok" | "fail";

const startedAt = Date.now();

async function checkStorage(): Promise<{ state: CheckState; detail?: string }> {
  try {
    // 존재만이 아니라 **쓸 수 있는지**까지 본다. 읽기 전용으로 마운트된 경우를 잡는다.
    await access(env.STORAGE_ROOT, constants.W_OK);
    return { state: "ok" };
  } catch {
    return {
      state: "fail",
      detail: `STORAGE_ROOT 에 쓸 수 없습니다: ${env.STORAGE_ROOT}`,
    };
  }
}

export async function GET() {
  const checks: Record<string, CheckState> = {};
  const details: Record<string, string> = {};

  const storage = await checkStorage();
  checks.storage = storage.state;
  if (storage.detail) details.storage = storage.detail;

  let diskFreeGb: number | null = null;
  try {
    const disk = await getDiskStatus();
    diskFreeGb = disk.freeGb;
    checks.disk = disk.ok ? "ok" : "fail";
    if (!disk.ok) {
      details.disk = `여유 ${disk.freeGb}GB — 임계치 ${env.DISK_MIN_FREE_GB}GB 미만`;
    }
  } catch {
    checks.disk = "fail";
    details.disk = "디스크 상태를 읽지 못했습니다";
  }

  const failed = Object.values(checks).some((c) => c === "fail");

  return Response.json(
    {
      status: failed ? "fail" : "ok",
      checks,
      ...(Object.keys(details).length > 0 ? { details } : {}),
      diskFreeGb,
      version: process.env.npm_package_version ?? "0.1.0",
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      // 아직 붙지 않은 검사를 숨기지 않고 드러낸다 (P1에서 채운다)
      pending: ["db", "redis"],
    },
    { status: failed ? 503 : 200 }
  );
}
