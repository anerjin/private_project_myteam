import { constants } from "node:fs";
import { access } from "node:fs/promises";

import { pingDb } from "@/lib/db";
import { getDiskStatus } from "@/lib/disk";
import { env } from "@/lib/env";
import { pingRedis } from "@/lib/redis";

/**
 * API-090 헬스 체크 (DEV-01 · 1.11절, NFR-AVAIL-002).
 *
 * **아직 붙지 않은 검사는 `checks` 에 넣지 않고 `pending` 으로 드러냅니다.**
 * 없는 검사를 `"ok"` 로 채우면 확인하지 않은 것을 확인한 것처럼 보고하게 됩니다.
 * `P1` 에서 `db`·`redis` 가 붙어 `pending` 이 비었습니다.
 */

export const dynamic = "force-dynamic";

type CheckState = "ok" | "fail";

const startedAt = Date.now();

/**
 * 검사 하나당 상한 시간.
 *
 * **헬스 체크는 무엇이 매달리든 정해진 시간 안에 답해야 합니다.** 답이 늦으면
 * 감시하는 쪽이 «죽었는지 느린 건지» 구분하지 못하고, 재시작 판단도 못 합니다.
 * 라이브러리의 타임아웃 설정에 기대지 않고 여기서 못을 박습니다.
 */
const CHECK_TIMEOUT_MS = 2000;

/** 검사 하나를 돌리고 실패해도 전체를 멈추지 않는다 */
async function run(
  name: string,
  fn: () => Promise<void>
): Promise<[string, CheckState, string?]> {
  try {
    await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`${CHECK_TIMEOUT_MS}ms 안에 응답 없음`)),
          CHECK_TIMEOUT_MS
        ).unref?.()
      ),
    ]);
    return [name, "ok"];
  } catch (e) {
    // 스택·접속 문자열은 노출하지 않는다 (NFR-SEC-016)
    const message = e instanceof Error ? e.message : "알 수 없는 오류";
    return [name, "fail", message];
  }
}

export async function GET() {
  const checks: Record<string, CheckState> = {};
  const details: Record<string, string> = {};

  // 서로 독립이므로 병렬로 돌린다. 하나가 느려도 나머지는 기다리지 않는다.
  const results = await Promise.all([
    run("db", pingDb),
    run("redis", pingRedis),
    run("storage", async () => {
      // 존재만이 아니라 **쓸 수 있는지**까지 본다. 읽기 전용 마운트를 잡는다.
      await access(env.STORAGE_ROOT, constants.W_OK);
    }),
  ]);

  for (const [name, state, detail] of results) {
    checks[name] = state;
    if (detail) details[name] = detail;
  }

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
    },
    { status: failed ? 503 : 200 }
  );
}
