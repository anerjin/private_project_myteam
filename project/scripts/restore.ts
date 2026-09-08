/**
 * 복구 · 복구 리허설 (`NFR-BACKUP-004`·`005`).
 *
 *   npm run restore                    최신 백업으로 **리허설** (임시 DB 로)
 *   npm run restore -- --file <이름>   특정 백업으로 리허설
 *   npm run restore -- --into-live     **실제 DB 를 덮어씁니다**
 *
 * ## 기본이 «리허설»입니다
 *
 * 임시 데이터베이스(`neowave_work_restore_test`)에 넣고, 행 수를 세어 보고,
 * 지웁니다. **실제 DB 는 건드리지 않습니다.**
 *
 * 분기 1회 리허설(`NFR-BACKUP-005`)이 요구사항인데, 「리허설용 절차」를 따로
 * 만들면 그 절차는 **실제 복구와 다른 것**이 됩니다 — 그러면 리허설이
 * 증명하는 것이 없습니다. 같은 스크립트가 목적지만 바꿉니다.
 *
 * ## 무엇을 증명하는가
 *
 * | 확인 | 왜 |
 * | --- | --- |
 * | 덤프가 **읽힌다** | 0바이트·잘린 파일을 거른다 |
 * | 스키마가 **선다** | 마이그레이션과 덤프가 어긋나면 여기서 걸린다 |
 * | 행이 **들어온다** | 「복구했는데 비어 있다」를 막는다 |
 * | 관리자 계정이 **있다** | 복구해도 못 들어가면 복구가 아니다 |
 *
 * ## 파일은 별도입니다
 *
 * DB 만 되돌리면 첨부·아카이브가 없는 자료가 됩니다. 파일 복구는
 * `BACKUP_ROOT\files` 를 `STORAGE_ROOT` 로 되돌리는 `robocopy` 이고,
 * 이 스크립트가 **명령을 찍어 줍니다** — 실제 파일을 덮어쓰는 것은
 * 사람이 보고 판단할 일입니다.
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

import { env } from "@/lib/env";

const CONTAINER = process.env.PG_CONTAINER ?? "neowave-work-postgres";
const BACKUP_ROOT = process.env.BACKUP_ROOT ?? "C:\\neowave-work-backup";
const DB_DIR = path.join(BACKUP_ROOT, "db");

/** 리허설용 임시 DB — 끝나면 지웁니다 */
const SCRATCH = "neowave_work_restore_test";

/**
 * 판정이 «실패»라는 뜻 — 스크립트가 터진 것과 구별합니다.
 *
 * 둘 다 종료 코드 1이지만, 사람이 볼 문구가 다릅니다: 앞은 「이 백업으로는
 * 복구할 수 없습니다」(이미 찍었습니다), 뒤는 스택입니다.
 */
class RehearsalFailed extends Error {}

const args = process.argv.slice(2);
const INTO_LIVE = args.includes("--into-live");
const fileArg = args[args.indexOf("--file") + 1];

function run(file: string, cmd: string[]): string {
  return execFileSync(file, cmd, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** 컨테이너 안에서 SQL 한 줄 */
function psql(database: string, sql: string, user: string): string {
  return run("docker", [
    "exec",
    CONTAINER,
    "psql",
    "-U",
    user,
    "-d",
    database,
    "-tAc",
    sql,
  ]);
}

function dbUrlParts() {
  const u = new URL(env.DATABASE_URL);
  return {
    user: decodeURIComponent(u.username),
    db: u.pathname.replace(/^\//, ""),
  };
}

function latestDump(): string {
  const files = readdirSync(DB_DIR)
    .filter((f) => f.endsWith(".dump"))
    .sort()
    .reverse();
  if (files.length === 0) {
    throw new Error(
      `${DB_DIR} 에 덤프가 없습니다. 먼저 npm run backup 을 돌리십시오.`
    );
  }
  return files[0]!;
}

async function main() {
  const { user, db: liveDb } = dbUrlParts();
  const dump = fileArg ?? latestDump();
  const target = INTO_LIVE ? liveDb : SCRATCH;

  console.log(INTO_LIVE ? "실제 DB 복구" : "복구 리허설 (임시 DB)");
  console.log(`  덤프 : ${dump}`);
  console.log(`  대상 : ${target}`);

  if (INTO_LIVE) {
    /*
     * **되돌릴 수 없습니다.** 지금 DB 를 통째로 덮어씁니다.
     * 그 전에 «지금 것»을 한 부 받아 둡니다 — 복구가 잘못된 백업이었을 때
     * 돌아올 자리가 있어야 합니다.
     */
    console.log("\n  실제 DB 를 덮어씁니다. 먼저 지금 상태를 받아 두십시오:");
    console.log("    npm run backup");
    console.log("\n  계속하려면 5초 안에 Ctrl+C 를 «누르지 마십시오»…");
    await new Promise((r) => setTimeout(r, 5000));
  }

  // 컨테이너가 덤프를 볼 수 있게 넣는다
  run("docker", ["cp", path.join(DB_DIR, dump), `${CONTAINER}:/tmp/${dump}`]);

  // 대상 DB 를 새로 만든다 (리허설이면 임시, 실제면 그대로 쓴다)
  if (!INTO_LIVE) {
    psql("postgres", `DROP DATABASE IF EXISTS ${SCRATCH}`, user);
    psql("postgres", `CREATE DATABASE ${SCRATCH}`, user);
  }

  /*
   * **정리는 반드시 돕니다.** 처음에는 성공 경로에만 뒀는데, 잘린 덤프로
   * 던져 보니 판정 도중에 죽으면서 **임시 DB 가 남았습니다** — 다음 리허설이
   * 「이미 있다」로 시작합니다. 되돌리는 일은 `finally` 에 둡니다.
   */
  try {
    await restoreAndCheck(target, dump, user, INTO_LIVE);
  } finally {
    run("docker", ["exec", CONTAINER, "rm", "-f", `/tmp/${dump}`]);
    if (!INTO_LIVE) {
      psql("postgres", `DROP DATABASE IF EXISTS ${SCRATCH}`, user);
      console.log(`  임시 DB(${SCRATCH})를 지웠습니다.`);
    }
  }
}

async function restoreAndCheck(
  target: string,
  dump: string,
  user: string,
  INTO_LIVE: boolean
): Promise<void> {
  /*
   * `--clean --if-exists` — 실제 DB 로 넣을 때 기존 객체를 지우고 덮습니다.
   * 리허설은 빈 DB 라 지울 것이 없지만, **같은 명령**을 써야 리허설이
   * 실제 복구를 증명합니다.
   *
   * `pg_restore` 는 소유자·확장 관련 경고를 자주 냅니다. 종료 코드가 0이 아니어도
   * 데이터가 다 들어오는 경우가 있어, **결과를 세어** 판정합니다.
   */
  try {
    run("docker", [
      "exec",
      CONTAINER,
      "pg_restore",
      "-U",
      user,
      "-d",
      target,
      "--clean",
      "--if-exists",
      "--no-owner",
      `/tmp/${dump}`,
    ]);
  } catch {
    console.log(
      "  (pg_restore 가 경고와 함께 끝났습니다 — 아래 숫자로 판정합니다)"
    );
  }

  /* ── 무엇이 들어왔는지 «세어» 봅니다 ────────────────────────────── */
  const problems: string[] = [];

  /*
   * **스키마부터 봅니다.** 잘린 덤프에서는 테이블이 아예 안 서고, 그때
   * `SELECT count(*) FROM users` 는 「relation does not exist」로 **죽습니다** —
   * 실패를 «판정»해야 할 자리에서 스크립트가 터지면, 리허설이 무엇을
   * 말하려던 것인지 사라집니다. 실제로 그렇게 터뜨려 보고 고쳤습니다.
   */
  const tables = Number(
    psql(
      target,
      "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'",
      user
    ).trim()
  );

  let users = 0;
  let admins = 0;
  let resources = 0;
  let categories = 0;

  if (tables < 20) {
    problems.push(
      `테이블이 ${tables}개뿐입니다 (28 근처여야 합니다) — 덤프가 잘렸거나 못 읽었습니다`
    );
  } else {
    const count = (table: string) =>
      Number(psql(target, `SELECT count(*) FROM ${table}`, user).trim());
    users = count("users");
    admins = Number(
      psql(
        target,
        "SELECT count(*) FROM users WHERE role='ADMIN' AND status='ACTIVE'",
        user
      ).trim()
    );
    resources = count("resources");
    categories = count("categories");

    if (users === 0) problems.push("계정이 0명입니다");
    /*
     * **관리자가 없으면 복구가 아닙니다.** 데이터가 다 돌아와도 아무도 못
     * 들어가면 서비스는 멈춘 것입니다.
     */
    if (admins === 0)
      problems.push("활성 관리자가 0명입니다 — 복구해도 못 들어갑니다");
    if (categories === 0)
      problems.push("카테고리가 0개입니다 — 분류가 통째로 비었습니다");
  }

  console.log("\n  들어온 것");
  console.log(
    `    테이블 ${tables} · 계정 ${users} · 자료 ${resources} · 카테고리 ${categories}`
  );

  if (problems.length > 0) {
    console.log("\n✗ 이 백업으로는 복구할 수 없습니다");
    for (const p of problems) console.log(`    · ${p}`);
    /*
     * **던지고 나갑니다** — `process.exit` 로 즉시 끝내면 위의 `finally` 가
     * 안 돌아 임시 DB 가 남습니다.
     */
    throw new RehearsalFailed();
  }

  console.log(
    INTO_LIVE
      ? "\n✓ 복구했습니다. 파일도 되돌리려면:"
      : "\n✓ 리허설 통과 — 이 백업으로 복구할 수 있습니다."
  );
  console.log(
    `    robocopy "${path.join(BACKUP_ROOT, "files")}" "${env.STORAGE_ROOT}" /MIR`
  );
  if (!INTO_LIVE) {
    console.log(
      "\n  분기 1회 리허설 때 **백업본을 외부 매체로 1부 복사**하십시오 (`DEC-024` 완화책)."
    );
  }
}

main().catch((e) => {
  // 판정 실패는 이미 문구를 찍었습니다 — 스택을 덧붙이면 그 문구가 묻힙니다
  if (!(e instanceof RehearsalFailed)) {
    console.error(e instanceof Error ? e.message : e);
  }
  process.exit(1);
});
