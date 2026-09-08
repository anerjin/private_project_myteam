/**
 * 유지보수 배치 (`REQ-04 · 4.8`, `DEC-020`·`DEC-021`·`DEC-053`).
 *
 *   npm run maintenance
 *
 * ## Windows 작업 스케줄러가 하루 한 번 부릅니다
 *
 * `DEC-053` 이 별도 워커 프로세스를 두지 않기로 했으므로 크론도 없습니다.
 * 백업이 이미 그 스케줄러를 쓰고 있어(`NFR-BACKUP-005`) **관리해야 할
 * 장치가 늘지 않습니다.**
 *
 * ## 관리자 화면의 「지금 실행」과 **같은 함수**입니다
 *
 * `maintenance.service.runDue` 하나이므로 두 경로가 다른 판단을 하지
 * 않습니다. 동시에 불려도 안전합니다 — 작업을 집는 것은
 * `job.service` 의 원자적 `updateMany` 라 둘 중 하나만 집습니다.
 *
 * ## 등록 예 (관리자 PowerShell)
 *
 * ```powershell
 * $act = New-ScheduledTaskAction -Execute "npm.cmd" -Argument "run maintenance" `
 *   -WorkingDirectory "E:\github\doi_dev_team\project"
 * $trg = New-ScheduledTaskTrigger -Daily -At 4am
 * Register-ScheduledTask -TaskName "Neowave Work 유지보수" -Action $act -Trigger $trg
 * ```
 */
import { db } from "@/lib/db";
import { humanBytes } from "@/lib/storage";
import type { Actor } from "@/server/auth/actor";
import "@/server/jobs";
import * as maintenanceService from "@/server/services/maintenance.service";

/**
 * 배치를 «누가» 돌렸는가.
 *
 * **가짜 사람을 만들지 않습니다.** 시드 관리자를 빌려 쓰면 감사 로그에
 * 「그 사람이 새벽 4시에 200건을 지웠다」로 남습니다. 실제 계정 중 하나를 쓰되
 * **요약 문구가 배치임을 말하게** 합니다.
 *
 * 🔄 `role: "ADMIN"` 으로 골랐습니다. `DEC-077` 로 등급이 사라져 조건이
 *    `status: "ACTIVE"` 하나가 됐습니다.
 */
async function batchActor(): Promise<Actor> {
  const admin = await db.user.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true },
  });
  if (!admin) {
    throw new Error("ACTIVE 계정이 없습니다. 배치가 남길 행위자가 없습니다.");
  }
  return { id: admin.id, username: admin.username, via: "WEB" };
}

async function main() {
  const started = Date.now();
  const actor = await batchActor();
  const r = await maintenanceService.runDue(actor);

  console.log("Neowave Work 유지보수");
  console.log(`  큐에 넣음 : ${r.queued.join(", ") || "없음"}`);
  console.log(`  건너뜀    : ${r.skipped.join(", ") || "없음"}`);
  console.log(
    `  보존 배치 : 익명화 ${r.retention.anonymized}건 · 감사 로그 정리 ${r.retention.auditLogsRemoved}건`
  );
  if (r.retention.keysExpiringSoon > 0) {
    console.log(
      `  ⚠ API 키 ${r.retention.keysExpiringSoon}개가 30일 안에 만료됩니다`
    );
  }
  if (r.retention.githubTokenMissing) {
    console.log("  ⚠ GITHUB_TOKEN 이 없습니다 — API 한도 시간당 60회");
  }
  console.log(
    `  디스크    : 여유 ${r.disk.freeGb}GB ${r.disk.ok ? "" : "(임계치 미만!)"}`
  );
  console.log(
    `  아카이브  : ${humanBytes(r.archive.bytes)}${r.archive.full ? " (상한 도달!)" : r.archive.warn ? " (80% 초과)" : ""}`
  );

  /*
   * **큐에 넣은 작업이 끝날 때까지 기다립니다.** 넣자마자 프로세스를 끝내면
   * `enqueueAndRun` 이 띄운 실행이 중간에 죽고 `RUNNING` 인 행이 남습니다 —
   * `DEC-053` 이 「PC 가 꺼지면 그렇게 된다」고 적은 바로 그 상태를
   * **스케줄러가 매일 만들게** 됩니다.
   */
  if (r.queued.length > 0) {
    await waitForJobs(started);
  }

  await db.$disconnect();
  process.exit(0);
}

/** 이보다 오래 걸리면 두고 나갑니다 — 다음 실행이 `RUNNING` 을 다시 집습니다 */
const MAX_WAIT_MS = 15 * 60 * 1000;

async function waitForJobs(since: number) {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const running = await db.job.count({
      where: {
        status: { in: ["QUEUED", "RUNNING"] },
        createdAt: { gte: new Date(since) },
      },
    });
    if (running === 0) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log(
    "  ⚠ 15분이 지나 남은 작업을 두고 나갑니다 — 다음 실행이 이어받습니다"
  );
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
