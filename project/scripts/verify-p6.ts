/**
 * `P6` 검증 — 작업 실행기 · GitHub 수집 · 저장소 (`DEC-053`).
 *
 *   npm run verify:p6
 *
 * **GitHub 을 실제로 부릅니다.** 토큰이 없으면 시간당 60회 제한이라
 * 몇 번 돌리면 막힐 수 있습니다 — 그때는 rate limit 경로가 제대로 도는지를
 * 보는 것으로 값이 있습니다(문구에 「몇 분 뒤」가 들어갑니다).
 */
import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";

import { parseResourceInput } from "@/features/resources/form.schema";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import * as storage from "@/lib/storage";
import type { Actor } from "@/server/auth/actor";
import { hashPassword } from "@/server/auth/password";
import "@/server/jobs";
import * as jobService from "@/server/services/job.service";
import * as resourceWrite from "@/server/services/resource.write";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(
    `${ok ? "  OK  " : "  실패"} ${label}${detail ? " — " + detail : ""}`
  );
  if (ok) pass++;
  else fail++;
}

const madeUsers: string[] = [];
const madeResources: string[] = [];
const madeKeys: string[] = [];

async function mkUser(tag: string) {
  const u = await db.user.create({
    data: {
      username: `vp6_${tag}_${randomBytes(4).toString("hex")}`,
      passwordHash: await hashPassword("Verify!12345"),
      name: `P6검증-${tag}`,
      status: "ACTIVE",
      role: "MEMBER",
    },
    select: { id: true, username: true, role: true },
  });
  madeUsers.push(u.id);
  return u;
}

const actorOf = (u: { id: string; username: string; role: string }): Actor => ({
  id: u.id,
  username: u.username,
  role: u.role as Actor["role"],
  via: "WEB",
});

async function msg(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "(오류 없음)";
  } catch (e) {
    return e instanceof AppError ? e.message : `(${String(e)})`;
  }
}

const jobOf = (id: string) =>
  db.job.findUniqueOrThrow({
    where: { id },
    select: {
      status: true,
      errorMessage: true,
      attempts: true,
      result: true,
      startedAt: true,
      finishedAt: true,
    },
  });

async function run() {
  const user = await mkUser("author");
  const actor = actorOf(user);

  console.log("\n★ 저장소 — 경로 이탈 방어 (NFR-SEC-019)");
  {
    /*
     * 문자열로 `includes("..")` 를 보는 검사는 뚫립니다.
     * **편 결과가 뿌리 밖인가**를 봐야 합니다.
     */
    const escapes = [
      "../outside.txt",
      "a/../../outside.txt",
      "a/./../../etc/passwd",
      "",
    ];
    for (const key of escapes) {
      const m = await msg(async () => storage.resolve(key));
      check(
        `«${key || "(빈 키)"}» 를 거부한다`,
        m.includes("잘못된 파일 경로"),
        m
      );
    }
    check(
      "정상 키는 통과한다",
      (await msg(async () => storage.resolve("archives/a/b/c.tar.gz"))) ===
        "(오류 없음)"
    );

    // 저장 키는 서버가 만든다 — 사용자 파일명이 경로에 안 들어간다
    const key = storage.newKey("attachments", ".png");
    check(
      "새 키가 «접두어/연월/랜덤.확장자» 모양이다",
      /^attachments\/\d{4}-\d{2}\/[0-9a-f]{32}\.png$/.test(key),
      key
    );
    const evil = storage.newKey("attachments", "../../x.exe");
    check(
      "이상한 확장자는 붙지 않는다",
      !evil.includes(".."),
      evil
    );
  }

  console.log("\n★ 저장소 — 상한을 «쓰면서» 본다 (NFR-SEC-009)");
  {
    const key = storage.newKey("verify", ".bin");
    madeKeys.push(key);
    const small = Readable.from([Buffer.alloc(1024, 7)]);
    const w = await storage.writeStream(key, small, 10_000);
    check("작은 파일은 저장된다", w.sizeBytes === 1024, `${w.sizeBytes}B`);
    check("해시가 함께 나온다", /^[0-9a-f]{64}$/.test(w.sha256));
    check("실제로 읽힌다", (await storage.size(key)) === 1024);

    const big = storage.newKey("verify", ".bin");
    const chunks = Array.from({ length: 20 }, () => Buffer.alloc(1024, 1));
    const m = await msg(() =>
      storage.writeStream(big, Readable.from(chunks), 5_000)
    );
    check("상한을 넘으면 거부한다", m.includes("허용 크기"), m);
    /*
     * **반쯤 쓴 파일을 남기지 않습니다.** 남으면 다음 사람이 정상 파일로
     * 오해하고, 아카이브라면 깨진 tar 를 내려받게 됩니다.
     */
    check("실패한 파일이 남지 않는다", !(await storage.exists(big)));
  }

  console.log("\n★ 작업 — 만드는 자리와 실행하는 자리가 나뉜다 (DEC-053)");
  {
    const job = await jobService.enqueue({ type: "CHECK_LINK" });
    const before = await jobOf(job.id);
    check("enqueue 는 QUEUED 만 만든다", before.status === "QUEUED");
    check("아직 시작하지 않았다", before.startedAt === null);

    // 처리기가 없는 타입 — 조용히 성공하면 안 된다
    await jobService.runNow(job.id);
    const after = await jobOf(job.id);
    check(
      "처리기가 없으면 FAILED 로 남는다",
      after.status === "FAILED" &&
        (after.errorMessage ?? "").includes("등록되지 않은"),
      after.errorMessage ?? ""
    );

    /*
     * **이미 돌고 있는 것을 두 번 돌리지 않습니다.** 아카이브라면 같은 파일에
     * 동시에 쓰게 됩니다. `updateMany` 의 갱신 «건수»로 판정하므로 동시 요청도
     * 하나만 통과합니다.
     */
    await db.job.update({
      where: { id: job.id },
      data: { status: "RUNNING" },
    });
    await jobService.runNow(job.id);
    const still = await jobOf(job.id);
    check("RUNNING 인 작업은 다시 집지 않는다", still.status === "RUNNING");
  }

  console.log("\n★ GitHub 등록 — 메타가 «자동으로» 채워진다 (FR-GH-001·002)");
  {
    const parsed = parseResourceInput({
      type: "GITHUB_REPO",
      title: "P6 검증 저장소",
      summary: "",
      url: "https://github.com/octocat/Hello-World",
      body: "",
      category: "",
      tags: "검증",
    });
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.fieldErrors));

    const created = await resourceWrite.create(actor, parsed.data);
    madeResources.push(created.id);

    const row = await db.githubRepo.findUniqueOrThrow({
      where: { resourceId: created.id },
    });
    check("owner/repo 가 URL 에서 나온다", row.owner === "octocat");
    check("메타는 아직 비어 있다", row.stars === null);

    // 액션이 하는 것과 같은 경로 — 만들고, 이번엔 «기다려서» 결과를 본다
    const job = await jobService.enqueue({
      type: "FETCH_GITHUB_META",
      resourceId: created.id,
    });
    await jobService.runNow(job.id);
    const done = await jobOf(job.id);

    if (done.status === "FAILED" && (done.errorMessage ?? "").includes("한도")) {
      console.log(
        `       (GitHub 한도로 건너뜀 — ${done.errorMessage})`
      );
      check(
        "한도 초과 문구가 «언제 풀리는지»를 말한다",
        /\d+분/.test(done.errorMessage ?? ""),
        done.errorMessage ?? ""
      );
    } else {
      check("작업이 DONE 이다", done.status === "DONE", done.errorMessage ?? "");
      const filled = await db.githubRepo.findUniqueOrThrow({
        where: { resourceId: created.id },
      });
      check("스타 수가 채워졌다", filled.stars !== null, `${filled.stars}`);
      check("기본 브랜치가 채워졌다", Boolean(filled.defaultBranch));
      check("README 를 받았다", Boolean(filled.readmeContent));
      check("살아 있다고 표시된다", filled.isGone === false);

      /*
       * **사람이 적은 것을 덮지 않습니다.** 제목은 사용자 것입니다.
       */
      const r = await db.resource.findUniqueOrThrow({
        where: { id: created.id },
        select: { title: true, summary: true },
      });
      check("제목은 그대로다", r.title === "P6 검증 저장소", r.title);
      check("비어 있던 요약만 채워졌다", Boolean(r.summary), r.summary ?? "");
    }
  }

  console.log("\n★ 없는 저장소 — «할 수 있는 일»을 말한다 (FR-GH-007)");
  {
    const parsed = parseResourceInput({
      type: "GITHUB_REPO",
      title: "없는 저장소",
      summary: "",
      url: `https://github.com/queenbee-verify/${randomBytes(8).toString("hex")}`,
      body: "",
      category: "",
      tags: "",
    });
    if (!parsed.ok) throw new Error("파싱 실패");
    const created = await resourceWrite.create(actor, parsed.data);
    madeResources.push(created.id);

    const job = await jobService.enqueue({
      type: "FETCH_GITHUB_META",
      resourceId: created.id,
    });
    await jobService.runNow(job.id);
    const done = await jobOf(job.id);
    const m = done.errorMessage ?? "";
    check(
      "FAILED 로 남고 이유가 적힌다",
      done.status === "FAILED" &&
        (m.includes("찾을 수 없습니다") || m.includes("한도")),
      m
    );
    check("시도 횟수가 올라간다", done.attempts >= 1, `${done.attempts}`);

    // 재실행 — `DEC-053` 의 재시도가 이것이다
    await jobService.runNow(job.id);
    const again = await jobOf(job.id);
    check(
      "FAILED 는 다시 실행된다",
      again.attempts > done.attempts,
      `${done.attempts} → ${again.attempts}`
    );
  }

  console.log(`\n합계: 통과 ${pass} · 실패 ${fail}`);
}

async function cleanup() {
  for (const k of madeKeys) await storage.remove(k).catch(() => {});
  if (madeResources.length) {
    await db.resource.deleteMany({ where: { id: { in: madeResources } } });
  }
  if (madeUsers.length) {
    await db.user.deleteMany({ where: { id: { in: madeUsers } } });
  }
  await db.job.deleteMany({ where: { resourceId: null, type: "CHECK_LINK" } });
}

run()
  .catch((e) => {
    console.error(e instanceof AppError ? e.message : e);
    fail++;
  })
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
    process.exit(fail > 0 ? 1 : 0);
  });
