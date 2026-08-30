/**
 * 백업 (`NFR-BACKUP-001`~`003`·`006`, `DEC-024`).
 *
 *   npm run backup
 *
 * ## 무엇을 받는가
 *
 * | 대상 | 방법 | 주기 |
 * | --- | --- | --- |
 * | DB | `pg_dump -Fc` (압축된 custom 포맷) | 매일 (`NFR-BACKUP-001`) |
 * | 파일 | `robocopy /MIR` — `STORAGE_ROOT` 전체 | 매 실행 (아래) |
 *
 * 규격은 파일을 **주 1회**라고 했지만(`NFR-BACKUP-003`) `robocopy /MIR` 은
 * 바뀐 것만 옮깁니다 — 안 바뀌었으면 몇 초입니다. **주 1회로 미룰 이유가
 * 없고**, 미루면 「마지막 동기화 이후 올린 파일」이 통째로 날아갑니다.
 *
 * ## 받고 나서 **읽어 봅니다**
 *
 * `pg_restore --list` 로 목록을 뽑아 봅니다. **못 읽는 파일은 백업이
 * 아닙니다** — 그런데 그 사실은 대개 복구해야 하는 날에 발견됩니다.
 * 0바이트 파일이 매일 쌓이는 것을 막는 유일한 방법은 매번 열어 보는 것입니다.
 *
 * ## 어디에 두는가
 *
 * `BACKUP_ROOT`(기본 `C:\queenbee-backup`) — **데이터와 다른 드라이브**입니다
 * (`DEC-024`). 같은 PC 라는 위험은 그 결정이 이미 적어 두었습니다:
 * **PC 고장·랜섬웨어에는 원본과 백업이 함께 사라집니다.**
 * 분기 복구 리허설 때 외부 매체로 1부 복사하는 것이 그 완화책입니다.
 *
 * ## Windows 작업 스케줄러에 매일 03:00 (`NFR-BACKUP-001`)
 *
 * ```powershell
 * $act = New-ScheduledTaskAction -Execute "npm.cmd" -Argument "run backup" `
 *   -WorkingDirectory "E:\github\doi_dev_team\project"
 * $trg = New-ScheduledTaskTrigger -Daily -At 3am
 * Register-ScheduledTask -TaskName "QueenBee 백업" -Action $act -Trigger $trg
 * ```
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";

import { env } from "@/lib/env";

const CONTAINER = process.env.PG_CONTAINER ?? "queenbee-postgres";
const BACKUP_ROOT = process.env.BACKUP_ROOT ?? "C:\\queenbee-backup";
const DB_DIR = path.join(BACKUP_ROOT, "db");
const FILES_DIR = path.join(BACKUP_ROOT, "files");

/** 보관 주기 (`NFR-BACKUP-002`) — 일 7 · 주 4 · 월 6 */
const KEEP = { daily: 7, weekly: 4, monthly: 6 };

/** 이 아래로 내려가면 백업을 만들지 않습니다 — 반쯤 쓰다 만 파일이 더 나쁩니다 */
const MIN_FREE_GB = 5;

function run(file: string, args: string[]): string {
  return execFileSync(file, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** `2026-08-30-0315` — 정렬하면 곧 시간순입니다 */
function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function freeGbOf(dir: string): number {
  const drive = path.parse(path.resolve(dir)).root.replace(/\\$/, "");
  const out = run("powershell", [
    "-NoProfile",
    "-Command",
    `(Get-PSDrive -Name '${drive.replace(":", "")}').Free`,
  ]);
  return Number(out.trim()) / 1024 ** 3;
}

function dbUrlParts() {
  const u = new URL(env.DATABASE_URL);
  return {
    user: decodeURIComponent(u.username),
    db: u.pathname.replace(/^\//, ""),
  };
}

async function main() {
  mkdirSync(DB_DIR, { recursive: true });
  mkdirSync(FILES_DIR, { recursive: true });

  const free = freeGbOf(BACKUP_ROOT);
  if (free < MIN_FREE_GB) {
    throw new Error(
      `백업 드라이브 여유가 ${free.toFixed(1)}GB 입니다 (최소 ${MIN_FREE_GB}GB). ` +
        `반쯤 쓰다 만 백업은 없는 것보다 나쁩니다.`
    );
  }

  const { user, db } = dbUrlParts();
  const name = `queenbee-${stamp()}.dump`;
  const inContainer = `/tmp/${name}`;
  const outPath = path.join(DB_DIR, name);

  console.log("QueenBee 백업");
  console.log(`  대상 : ${BACKUP_ROOT} (여유 ${free.toFixed(1)}GB)`);

  /*
   * **컨테이너 안에 쓰고 꺼냅니다.** `docker exec … > file` 로 stdout 을
   * 흘리면 Windows 셸이 바이너리에 CRLF 를 섞어 **복구할 수 없는 덤프**가
   * 됩니다. 그 실패는 복구하는 날에야 드러납니다.
   */
  run("docker", [
    "exec",
    CONTAINER,
    "pg_dump",
    "-U",
    user,
    "-d",
    db,
    "-Fc",
    "-f",
    inContainer,
  ]);
  run("docker", ["cp", `${CONTAINER}:${inContainer}`, outPath]);
  run("docker", ["exec", CONTAINER, "rm", "-f", inContainer]);

  const size = statSync(outPath).size;
  console.log(`  DB   : ${name} (${(size / 1024 ** 2).toFixed(1)}MB)`);

  /*
   * **읽어 봅니다.** 목록이 나오면 헤더와 TOC 가 온전한 것입니다 —
   * 0바이트나 잘린 파일은 여기서 걸립니다.
   */
  const listed = run("docker", [
    "run",
    "--rm",
    "-v",
    `${DB_DIR}:/backup`,
    "postgres:16-alpine",
    "pg_restore",
    "--list",
    `/backup/${name}`,
  ]);
  const entries = listed.split("\n").filter((l) => l && !l.startsWith(";")).length;
  if (entries === 0) {
    throw new Error(`덤프를 읽었지만 항목이 0개입니다: ${name}`);
  }
  console.log(`  검증 : pg_restore --list 로 ${entries}개 항목 확인`);

  /*
   * **파일도 함께.** `/MIR` 은 지운 것도 반영합니다 — 백업이 원본과 같아야
   * 「복구했더니 지운 파일이 살아났다」가 안 생깁니다.
   * robocopy 는 0~7 이 정상 종료입니다(8 이상이 실패).
   */
  let copied = "동기화 없음";
  if (existsSync(env.STORAGE_ROOT)) {
    try {
      run("robocopy", [env.STORAGE_ROOT, FILES_DIR, "/MIR", "/NFL", "/NDL", "/NJH", "/NP", "/R:2", "/W:2"]);
      copied = "완료";
    } catch (e) {
      const code = (e as { status?: number }).status ?? 0;
      if (code >= 8) throw new Error(`robocopy 실패 (코드 ${code})`);
      copied = `완료 (robocopy ${code})`;
    }
  }
  console.log(`  파일 : ${copied}`);

  const removed = prune();
  if (removed.length > 0) {
    console.log(`  정리 : ${removed.length}개 (${KEEP.daily}일 · ${KEEP.weekly}주 · ${KEEP.monthly}월 보관)`);
  }

  const kept = readdirSync(DB_DIR).filter((f) => f.endsWith(".dump")).length;
  console.log(`\n끝. 보관 중인 덤프 ${kept}개`);
}

/**
 * 보관 주기 정리 (`NFR-BACKUP-002` — 일 7 · 주 4 · 월 6).
 *
 * **최신 7개**를 일 단위로 남기고, 그 밖에서 **주마다 하나**·**달마다 하나**를
 * 남깁니다. 어느 규칙에도 안 걸린 것만 지웁니다 — 규칙이 겹치면 살립니다.
 */
function prune(): string[] {
  const files = readdirSync(DB_DIR)
    .filter((f) => f.endsWith(".dump"))
    .sort()
    .reverse(); // 최신 먼저

  const keep = new Set<string>(files.slice(0, KEEP.daily));

  const weekSeen = new Set<string>();
  const monthSeen = new Set<string>();
  for (const f of files) {
    const m = /^queenbee-(\d{4})-(\d{2})-(\d{2})-/.exec(f);
    if (!m) continue;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const week = `${d.getFullYear()}-W${Math.ceil(((+d - +new Date(d.getFullYear(), 0, 1)) / 86400000 + 1) / 7)}`;
    const month = `${m[1]}-${m[2]}`;

    if (weekSeen.size < KEEP.weekly && !weekSeen.has(week)) {
      weekSeen.add(week);
      keep.add(f);
    }
    if (monthSeen.size < KEEP.monthly && !monthSeen.has(month)) {
      monthSeen.add(month);
      keep.add(f);
    }
  }

  const removed: string[] = [];
  for (const f of files) {
    if (keep.has(f)) continue;
    unlinkSync(path.join(DB_DIR, f));
    removed.push(f);
  }
  return removed;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
