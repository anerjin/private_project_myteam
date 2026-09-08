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
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";

import { parseResourceInput } from "@/features/resources/form.schema";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import * as storage from "@/lib/storage";
import type { Actor } from "@/server/auth/actor";
import { hashPassword } from "@/server/auth/password";
import "@/server/jobs";
import * as fileService from "@/server/services/file.service";
import * as githubService from "@/server/services/github.service";
import * as jobService from "@/server/services/job.service";
import * as relationService from "@/server/services/relation.service";
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

/**
 * 이 시각 이후에 생긴 `jobs` 행은 **이 검증이 만든 것**입니다.
 *
 * 여기도 작업을 여럿 만듭니다 — 썸네일(처리기 없음)·GitHub 메타·아카이브·
 * 링크 확인. 그중 **일부만** 치우고 있었습니다(`CHECK_LINK` 와 한 묶음).
 * 남은 것은 관리자 홈의 「실패한 작업 N건」 배너에 그대로 쌓입니다 —
 * 운영자가 「하드코딩 아니냐」고 물은 그 숫자입니다.
 *
 * `verify-p8` 과 같은 방식으로 **시각으로 자릅니다.**
 */
const startedAt = new Date();

/** dev 서버 주소. **바깥 인터넷 대신 우리 서버**를 쓰는 검사들이 함께 씁니다 */
const BASE = "http://localhost:3100";

const madeUsers: string[] = [];
const madeResources: string[] = [];
const madeKeys: string[] = [];

/** 「한 번도 못 읽은」 저장소의 slug — 화면 문구를 `checkScreens` 가 봅니다 */
let goneSlug: string | null = null;

async function mkUser(tag: string) {
  const u = await db.user.create({
    data: {
      username: `vp6_${tag}_${randomBytes(4).toString("hex")}`,
      passwordHash: await hashPassword("Verify!12345"),
      name: `P6검증-${tag}`,
      status: "ACTIVE",
    },
    select: { id: true, username: true },
  });
  madeUsers.push(u.id);
  return u;
}

const actorOf = (u: { id: string; username: string }): Actor => ({
  id: u.id,
  username: u.username,
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
    check("이상한 확장자는 붙지 않는다", !evil.includes(".."), evil);
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
    /*
     * **처리기가 «없는» 타입이어야 합니다.**
     *
     * 처음에는 `CHECK_LINK` 를 썼는데 `P8` 이 그 처리기를 만들면서 이 검사가
     * 깨졌습니다 — 코드가 아니라 **검사의 전제**가 낡은 것입니다.
     * `GENERATE_THUMBNAIL` 은 작업 타입과 `files.role=THUMBNAIL` 자리는 있고
     * 만드는 코드가 없는, `check:fr` 이 **부채로 인정한** 상태입니다.
     * 그것이 채워지는 날 이 검사도 같은 이유로 깨질 텐데, 그때는 처리기가
     * 없는 타입을 다시 고르면 됩니다 — 「처리기가 없으면 조용히 성공하지
     * 않는다」는 성질 자체는 그대로입니다.
     *
     * > **요구사항 번호를 여기 안 적습니다** (`DEC-049`). 「아직 없다」를
     * > 설명하는 주석이 그 번호를 달면 `check:fr` 이 「만들었다」로 셉니다 —
     * > 실제로 여기서 잡혔습니다.
     */
    const job = await jobService.enqueue({ type: "GENERATE_THUMBNAIL" });
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
    check(
      "돌고 있는 작업은 재실행 대상이 아니다",
      !jobService.isRetryable({ status: "RUNNING", startedAt: new Date() })
    );

    /*
     * **`DEC-053` 이 「잃는 것」으로 적은 그 상태입니다.** PC 가 꺼지면
     * `RUNNING` 이 남는데, 전에는 `runNow` 가 `QUEUED`·`FAILED` 만 집고
     * 화면에도 버튼이 없어 **할 수 있는 일이 하나도 없었습니다** — 결정의
     * 「잃는 것」 칸이 거짓이었습니다.
     */
    const long = new Date(Date.now() - 60 * 60 * 1000);
    await db.job.update({
      where: { id: job.id },
      data: { status: "RUNNING", startedAt: long },
    });
    check(
      "오래 멈춘 작업은 재실행 대상이다",
      jobService.isRetryable({ status: "RUNNING", startedAt: long })
    );
    await jobService.runNow(job.id);
    const revived = await jobOf(job.id);
    check(
      "멈춘 작업을 다시 집는다",
      revived.status === "FAILED" &&
        (revived.errorMessage ?? "").includes("등록되지 않은"),
      `${revived.status} · ${revived.errorMessage ?? ""}`
    );
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

    if (
      done.status === "FAILED" &&
      (done.errorMessage ?? "").includes("한도")
    ) {
      console.log(`       (GitHub 한도로 건너뜀 — ${done.errorMessage})`);
      check(
        "한도 초과 문구가 «언제 풀리는지»를 말한다",
        /\d+분/.test(done.errorMessage ?? ""),
        done.errorMessage ?? ""
      );
    } else {
      check(
        "작업이 DONE 이다",
        done.status === "DONE",
        done.errorMessage ?? ""
      );
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
      url: `https://github.com/neowave-work-verify/${randomBytes(8).toString("hex")}`,
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

    const row = await db.githubRepo.findUniqueOrThrow({
      where: { resourceId: created.id },
      select: { isGone: true, stars: true },
    });
    /*
     * **한도에 걸리면 「없는 저장소」인지 알 수 없습니다.**
     *
     * `isGone` 은 GitHub 이 **404 를 줬을 때** 섭니다. 한도 초과(`RATE_LIMITED`)
     * 는 「못 물어봤다」이지 「없다」가 아니므로 그때 `isGone` 이 안 서는 것이
     * **맞습니다.** 그런데 검사는 그걸 실패로 셌습니다 — 바로 위 두 블록이
     * 「한도로 건너뜀」을 찍고 넘어가는 동안 여기만 빨개졌습니다.
     * **검사가 틀린 것**이고, 한 시간 동안 계속 빨간 채로 남습니다.
     */
    const rateLimited = (again.errorMessage ?? "").includes("한도");
    if (rateLimited) {
      console.log(
        "       (GitHub 한도로 건너뜀 — 404 를 받아야 판정되는 검사입니다)"
      );
    } else {
      check("못 읽으면 isGone 이 선다", row.isGone === true);
      check("한 번도 못 읽었으므로 stars 가 비어 있다", row.stars === null);
      // 화면이 그 둘을 구별해 말하는지는 `checkScreens` 가 봅니다
      goneSlug = created.slug;
    }
  }

  /*
   * `REQ-01 · 1.2` 의 「URL 하나로 등록하면 메타데이터가 자동으로 채워진다」가
   * **GitHub 에만** 해당됐습니다. `FETCH_URL_META` 는 스키마와 라벨에만 있고
   * `register` 된 처리기가 없어서, 논문·문서 사이트·블로그는 사람이 손으로
   * 요약을 적었습니다.
   */
  console.log("\n★ GitHub 이 아닌 자료 — 메타도 자동으로 (FR-RES-005)");
  {
    const mk = async (title: string, url: string) => {
      const p = parseResourceInput({
        type: "AI_MATERIAL",
        title,
        summary: "",
        url,
        materialKind: "ARTICLE",
        body: "",
        category: "",
        tags: "",
      });
      if (!p.ok) throw new Error(JSON.stringify(p.fieldErrors));
      const r = await resourceWrite.create(actorOfId(user.id), p.data);
      madeResources.push(r.id);
      const j = await jobService.enqueue({
        type: "FETCH_URL_META",
        resourceId: r.id,
      });
      await jobService.runNow(j.id);
      return { resource: r, job: await jobOf(j.id) };
    };

    const paper = await mk(
      "메타 수집 검증 — 논문",
      "https://arxiv.org/abs/1706.03762"
    );
    check(
      "처리기가 등록돼 있다",
      paper.job.status !== "FAILED",
      paper.job.errorMessage ?? ""
    );

    if (paper.job.status === "DONE") {
      const row = await db.resource.findUniqueOrThrow({
        where: { id: paper.resource.id },
        select: {
          summary: true,
          aiMaterial: { select: { sourceName: true, authors: true } },
        },
      });
      check("빈 요약이 채워진다", (row.summary?.length ?? 0) > 20);
      check("출처를 알아낸다", row.aiMaterial?.sourceName === "arXiv.org");
      check("저자를 알아낸다", (row.aiMaterial?.authors.length ?? 0) > 0);
    } else {
      console.log(`       (바깥이 안 열려 건너뜀 — ${paper.job.errorMessage})`);
    }

    /*
     * ★ **SSRF — 여기서 «가드를 안 기다린» 적이 있습니다.**
     *
     * `assertPublicUrl` 은 이름을 DNS 로 풀어 보므로 async 인데 `await` 없이
     * 불렀습니다. 그러면 **가드가 아무것도 막지 않고** 다음 줄이 사내 주소로
     * 브라우저를 엽니다. 게다가 거부는 처리되지 않은 rejection 이 되어
     * **프로세스를 죽입니다** — 작업의 try/catch 도 못 잡습니다.
     *
     * 사내망 주소로 시험해서 잡았습니다. 이제 `no-floating-promises` 가
     * 같은 실수를 컴파일 전에 잡지만, **실제로 막히는가**는 여기서 봅니다.
     */
    for (const [label, url] of [
      ["사내망 IP", "http://192.168.0.1/"],
      ["이 PC 의 DB 포트", "http://localhost:5432/"],
    ] as const) {
      const bad = await mk(`메타 수집 검증 — ${label}`, url);
      check(
        `${label} 는 열지 않는다`,
        bad.job.status === "FAILED" &&
          (bad.job.errorMessage ?? "").includes("내부 주소"),
        bad.job.errorMessage ?? `${bad.job.status}`
      );
    }
  }

  /*
   * `REQ-01 · 1.1` 의 **나머지 절반.** 저장소는 tarball 로 지켜 왔는데, 이 팀
   * 자료의 절반은 문서 사이트·논문이고 **그것들이 사라지면 요약 한 줄만**
   * 남았습니다.
   */
  console.log("\n★ 웹 페이지 보관 — 저장소가 아닌 자료도 (REQ-01 · 1.1)");
  {
    const p = parseResourceInput({
      type: "AI_MATERIAL",
      title: "웹 보관 검증",
      summary: "",
      // **우리 서버를 씁니다** — 바깥 사정에 흔들리면 검증이 아닙니다
      url: `${BASE}/login`,
      materialKind: "ARTICLE",
      body: "",
      category: "",
      tags: "",
    });
    if (!p.ok) throw new Error(JSON.stringify(p.fieldErrors));
    const r = await resourceWrite.create(actorOfId(user.id), p.data);
    madeResources.push(r.id);

    const j = await jobService.enqueue({
      type: "ARCHIVE_URL",
      resourceId: r.id,
    });
    await jobService.runNow(j.id);
    const done = await jobOf(j.id);
    check(
      "보관 작업이 끝난다",
      done.status === "DONE",
      done.errorMessage ?? ""
    );

    const file = await githubService.archivedFile(r.id);
    check("보관본이 생긴다", file !== null, file?.name ?? "");

    if (file) {
      const link = await db.resourceFile.findFirstOrThrow({
        where: { resourceId: r.id, role: "ARCHIVE" },
        select: { file: { select: { storageKey: true } } },
      });
      const buf = await readFile(storage.resolve(link.file.storageKey));
      const head = buf.subarray(0, 400).toString("utf8");
      /*
       * **한 파일에 다 들었는지**가 이 기능의 전부입니다. HTML 만 저장하면
       * CSS·이미지가 바깥을 가리켜 **원본이 죽는 날 같이 죽습니다.**
       */
      check(
        "MHTML 이다 — 한 파일에 다 들었다",
        head.includes("MIME-Version") && head.includes("multipart/related")
      );
      check(
        "본문 글자가 담겼다",
        // 두 단어를 찾으면 quoted-printable soft line break(`=\r\n`)나
        // HTML 공백 접힘에 쪼개져 헛짚는다. 쪼개지지 않는 한 토큰으로 본다.
        buf.toString("utf8").includes("Neowave"),
        "빈 껍데기를 저장하면 보관이 아니다"
      );

      /*
       * **내려받기가 GitHub 자료만 열어 줬습니다.** `github_repos` 행이 없으면
       * 「자료를 찾을 수 없습니다」였는데, 문서 사이트에는 그 행이 없습니다.
       */
      const dl = await githubService.archiveForDownload(r.id);
      check(
        "저장소가 아닌 자료도 내려받을 수 있다",
        dl.sizeBytes > 0,
        dl.filename
      );
      /*
       * **형식을 라우트가 정하고 있었습니다** — `application/gzip` 이 박혀
       * 있었고, tarball 뿐이던 시절의 값입니다. `.mhtml` 을 gzip 이라고 말하면
       * 브라우저가 압축 파일로 취급합니다.
       */
      check(
        "형식은 파일이 말한다",
        dl.mimeType === "message/rfc822",
        dl.mimeType
      );
    }
  }

  console.log("\n★ 웹 보관 — 사내 주소는 담지 않는다 (NFR-SEC-010)");
  {
    const p = parseResourceInput({
      type: "AI_MATERIAL",
      title: "웹 보관 검증 — 사내망",
      summary: "",
      url: "http://192.168.0.1/",
      materialKind: "ARTICLE",
      body: "",
      category: "",
      tags: "",
    });
    if (!p.ok) throw new Error(JSON.stringify(p.fieldErrors));
    const r = await resourceWrite.create(actorOfId(user.id), p.data);
    madeResources.push(r.id);
    const j = await jobService.enqueue({
      type: "ARCHIVE_URL",
      resourceId: r.id,
    });
    await jobService.runNow(j.id);
    const done = await jobOf(j.id);
    check(
      "사내 주소는 보관하지 않는다",
      done.status === "FAILED" &&
        (done.errorMessage ?? "").includes("내부 주소"),
      done.errorMessage ?? done.status
    );
    check(
      "실패하면 보관본도 안 남는다",
      (await githubService.archivedFile(r.id)) === null
    );
  }

  console.log("\n★ 첨부 — 3중 검증 (NFR-SEC-009 · FR-FILE-004)");
  {
    const parsed = parseResourceInput({
      type: "DEV_NOTE",
      title: "첨부 검증용",
      summary: "",
      url: "",
      body: "본문",
      category: "",
      tags: "",
      noteKind: "TIP",
    });
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.fieldErrors));
    const res = await resourceWrite.create(actor, parsed.data);
    madeResources.push(res.id);

    const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const stream = (b: Buffer) =>
      Readable.toWeb(Readable.from([b])) as ReadableStream<Uint8Array>;

    // ① 허용 목록에 없는 확장자
    let m = await msg(() =>
      fileService.attach(actor, {
        resourceId: res.id,
        filename: "evil.exe",
        contentType: "application/octet-stream",
        body: stream(PNG),
      })
    );
    check("허용하지 않는 확장자를 막는다", m.includes("받지 않습니다"), m);

    // ② 확장자와 선언 MIME 이 어긋남
    m = await msg(() =>
      fileService.attach(actor, {
        resourceId: res.id,
        filename: "a.png",
        contentType: "application/pdf",
        body: stream(PNG),
      })
    );
    check("확장자와 형식이 어긋나면 막는다", m.includes("맞지 않습니다"), m);

    /*
     * ③ **이름만 바꾼 파일.** 확장자·MIME 은 통과하지만 내용이 PNG 가 아닙니다 —
     * 매직 넘버만 이걸 잡습니다. 셋을 다 보는 이유가 이 줄입니다.
     */
    m = await msg(() =>
      fileService.attach(actor, {
        resourceId: res.id,
        filename: "fake.png",
        contentType: "image/png",
        body: stream(Buffer.from("MZ\x90\x00 실행파일입니다")),
      })
    );
    check("이름만 바꾼 파일을 매직 넘버로 잡는다", m.includes("아닙니다"), m);

    // ④ 정상 첨부
    const att = await fileService.attach(actor, {
      resourceId: res.id,
      filename: "보고서.png",
      contentType: "image/png",
      body: stream(PNG),
    });
    check(
      "정상 파일은 첨부된다",
      att.sizeBytes === PNG.length,
      `${att.sizeBytes}B`
    );
    check("원본 이름이 그대로 남는다", att.originalName === "보고서.png");

    const stored = await db.file.findUniqueOrThrow({
      where: { id: att.id },
      select: { storageKey: true },
    });
    madeKeys.push(stored.storageKey);
    /*
     * **사용자 파일명이 경로에 들어가지 않습니다** (`NFR-SEC-019`).
     * 한글·공백·`..` 를 다루는 문제 전부가 «안 쓰면» 사라집니다.
     */
    check(
      "저장 키에 원본 이름이 없다",
      !stored.storageKey.includes("보고서"),
      stored.storageKey
    );
    check("디스크에 실제로 있다", await storage.exists(stored.storageKey));

    const list = await fileService.listFor(res.id);
    check("목록에 나온다", list.length === 1 && list[0].id === att.id);

    // ⑤ 삭제 — 연결이 끊기고 파일도 사라진다
    await fileService.detach(actor, att.id);
    check(
      "첨부가 목록에서 빠진다",
      (await fileService.listFor(res.id)).length === 0
    );
    check(
      "고아 파일이 디스크에서 지워진다",
      !(await storage.exists(stored.storageKey))
    );

    const stranger = await mkUser("stranger");
    const att2 = await fileService.attach(actor, {
      resourceId: res.id,
      filename: "b.png",
      contentType: "image/png",
      body: stream(PNG),
    });
    const k2 = await db.file.findUniqueOrThrow({
      where: { id: att2.id },
      select: { storageKey: true },
    });
    madeKeys.push(k2.storageKey);

    /*
     * 🔄 **초안 첨부의 범위 검증이 여기 있었습니다** — 「남의 초안 첨부는 못 받고,
     *    작성자와 `EDITOR` 이상은 받는다」. `DEC-077` 로 등급이 사라져
     *    `file.service.draftScope` 가 없어졌고, **로그인한 사람이면 초안 첨부도
     *    받습니다.** 남은 관문은 라우트의 `requireActor()` 이고, 그건
     *    `checkScreens` 의 「로그인 없이 못 받는다」가 봅니다.
     */
    await db.resource.update({
      where: { id: res.id },
      data: { status: "DRAFT" },
    });
    check(
      "초안이어도 첨부를 받는다 (DEC-077)",
      (await msg(() => fileService.forDownload(att2.id))) === "(오류 없음)"
    );
    await db.resource.update({
      where: { id: res.id },
      data: { status: "PUBLISHED" },
    });

    /*
     * 🔄 **「남의 첨부는 못 지운다」**였습니다(`canEditResource`). `DEC-077` 로
     *    그 판정이 사라졌습니다. **순서를 바꿨습니다** — 지우기가 이제 성공하므로
     *    위의 내려받기 검사보다 «뒤»에 와야 합니다. 안 그러면 없는 파일을 받으려다
     *    엉뚱한 이유로 실패합니다.
     */
    m = await msg(() => fileService.detach(actorOf(stranger), att2.id));
    check("남의 첨부도 지운다 (DEC-077)", m === "(오류 없음)", m);
  }

  console.log("\n★ 동시 실행 상한 — P7 의 대량 유입에 대비 (DEC-053)");
  {
    /*
     * CLI 가 10건을 한 번에 등록하면 `runNow` 10개가 동시에 뜨고 아무도
     * 세지 않았습니다 — GitHub 한도를 한 번에 태우고 아카이브 여럿이 같은
     * 디스크에 씁니다. BullMQ 없이 **상한 하나**로 받습니다.
     */
    let peak = 0;
    let live = 0;
    jobService.register("CHECK_LINK", async () => {
      live++;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 60));
      live--;
    });

    const jobs = await Promise.all(
      Array.from({ length: 8 }, () =>
        jobService.enqueue({ type: "CHECK_LINK" })
      )
    );
    await Promise.all(jobs.map((j) => jobService.runNow(j.id)));
    check("동시에 도는 작업이 상한을 넘지 않는다", peak <= 2, `최대 ${peak}개`);
    check(
      "그래도 전부 끝난다",
      (
        await db.job.findMany({
          where: { id: { in: jobs.map((j) => j.id) } },
          select: { status: true },
        })
      ).every((j) => j.status === "DONE"),
      "상한이 작업을 버리면 안 된다"
    );
    await db.job.deleteMany({ where: { id: { in: jobs.map((j) => j.id) } } });
  }

  console.log("\n★ 자료 간 연결 — 한 행을 «양쪽에서» 읽는다 (FR-RES-012)");
  {
    const mk = async (title: string) => {
      const p = parseResourceInput({
        type: "DEV_NOTE",
        title,
        summary: "",
        url: "",
        body: "본문",
        category: "",
        tags: "",
        noteKind: "TIP",
      });
      if (!p.ok) throw new Error(JSON.stringify(p.fieldErrors));
      const r = await resourceWrite.create(actor, p.data);
      madeResources.push(r.id);
      return r;
    };

    const a = await mk("연결 A");
    const b = await mk("연결 B");

    let m = await msg(() => relationService.link(actor, a.id, a.id, "RELATED"));
    check("자기 자신과는 못 잇는다", m.includes("자기 자신"), m);

    await relationService.link(actor, a.id, b.id, "SUPERSEDES");

    const fromA = await relationService.listFor(a.id);
    const fromB = await relationService.listFor(b.id);
    check("A 에서 B 가 보인다", fromA.length === 1 && fromA[0].id === b.id);
    check("B 에서도 A 가 보인다", fromB.length === 1 && fromB[0].id === a.id);
    /*
     * **행은 하나입니다.** 두 개를 만들면 한쪽만 지워지는 순간
     * 「A 에서는 보이는데 B 에서는 안 보이는」 상태가 됩니다.
     */
    check(
      "행은 하나뿐이다",
      (await db.resourceRelation.count({
        where: { OR: [{ fromId: a.id }, { toId: a.id }] },
      })) === 1
    );
    check("방향이 구별된다", fromA[0].outgoing && !fromB[0].outgoing);

    // 같은 연결을 다시 만들어도 오류가 아니다 — 같은 판단일 뿐
    m = await msg(() => relationService.link(actor, b.id, a.id, "SUPERSEDES"));
    check("반대 방향으로 또 이어도 조용하다", m === "(오류 없음)", m);
    check(
      "그래도 행은 하나다",
      (await db.resourceRelation.count({
        where: { OR: [{ fromId: a.id }, { toId: a.id }] },
      })) === 1
    );

    /*
     * 🔄 **「남의 연결은 못 끊는다」**였습니다 — 「만든 쪽 자료를 못 고치면 거부」
     *    (`canEditResource`). `DEC-077` 로 사라졌습니다.
     *
     *    **반대쪽에서 끊어도 된다**(한 행이므로)는 성질은 그대로이고, 그것을
     *    이 한 번의 끊기가 함께 봅니다 — `b → a` 로 걸고 `b, a` 로 끊습니다.
     */
    const stranger = await mkUser("rel-stranger");
    m = await msg(() =>
      relationService.unlink(actorOf(stranger), b.id, a.id, "SUPERSEDES")
    );
    check("남도 연결을 끊는다 (DEC-077)", m === "(오류 없음)", m);
    check(
      "끊으면 양쪽에서 사라진다",
      (await relationService.listFor(a.id)).length === 0
    );
  }

  await checkScreens(user.id);

  console.log(`\n합계: 통과 ${pass} · 실패 ${fail}`);
}

/**
 * ## 화면으로 확인 — **service 를 직접 부른 것은 화면 검증이 아니다**
 *
 * `DEV-07 · 7.11` 리뷰 체크리스트의 문장입니다. `P2` 에서 폼이 액션을 부르지
 * 않는 것을 놓쳤고, `P4` 에서 삭제 버튼이 토스트만 띄우는 것을 놓쳤습니다.
 *
 * 여기서는 **dev 서버에 쿠키를 들고** 상세·작업 화면을 열어
 * ① 등록한 GitHub 자료의 메타가 화면에 나오고
 * ② 아카이브 다운로드 주소가 실제로 응답하고
 * ③ 첨부가 스트림으로 내려오는지를 봅니다. `npm run dev` 가 떠 있어야 합니다.
 */
/**
 * ## 화면으로 확인 — **service 를 직접 부른 것은 화면 검증이 아니다**
 *
 * `DEV-07 · 7.11` 리뷰 체크리스트의 문장입니다. 그리고 이번에 그 값이 나왔습니다:
 *
 * > **한국어 제목의 자료는 URL 로 열리지 않았습니다.** `params.slug` 가
 * > 퍼센트 인코딩된 채로 들어와 `findBySlug("%ED%99%94…")` 가 못 찾았고,
 * > 화면은 404 였습니다. `P4`·`P5` 의 검증은 전부 service 를 직접 불렀기 때문에
 * > 이 구멍이 세 페이즈를 지나 살아 있었습니다.
 *
 * ## 「무엇이 있는가」로 확인할 때의 함정
 *
 * 처음엔 `html.includes("첨부")` 로 봤는데 **커맨드 팔레트 색인**에 모든 자료
 * 제목이 들어 있어 404 페이지에서도 통과했습니다. 셋이 그렇게 초록이었습니다.
 * 그래서 지금은 **본문에만 나오는 문자열**과 **not-found 표식의 부재**를 봅니다.
 */
async function checkScreens(userId: string) {
  console.log("\n★ 화면으로 확인 — 관통 (P6 DoD)");

  const { issue } = await import("@/server/auth/session");
  const { token } = await issue(userId, { userAgent: "verify-p6" });
  const cookie = `${process.env.SESSION_COOKIE_NAME || "nw_session"}=${token}`;
  const NOT_FOUND = "NEXT_HTTP_ERROR_FALLBACK;404";

  /**
   * dev 서버는 **첫 컴파일에서 간헐적으로 500** 을 냅니다(Turbopack 이 청크를
   * 만드는 사이의 경합 — `Tooltip must be used within TooltipProvider`).
   * 두 번째 요청은 항상 정상이고 `npm run build` 는 통과하므로, 여기서만
   * 한 번 더 시도합니다. **제품 결함이 아니라 개발 서버의 성질**입니다.
   */
  const get = async (path: string, headers: Record<string, string> = {}) => {
    for (let i = 0; i < 2; i++) {
      try {
        const r = await fetch(BASE + path, { headers: { cookie, ...headers } });
        if (r.status !== 500) return r;
      } catch {
        return null;
      }
    }
    return fetch(BASE + path, { headers: { cookie, ...headers } });
  };

  /*
   * **「못 읽었다」와 「사라졌다」를 화면이 구별해 말하는가** (`FR-GH-007`).
   *
   * `isGone` 은 404 하나로 세 가지를 덮습니다 — 삭제됨 · 비공개로 바뀜 ·
   * **처음부터 못 읽음**. 화면은 전부 「원본이 사라졌습니다 … 아래 아카이브를
   * 이용하세요」라고 말하고 있었습니다. 사내 저장소를 등록한 운영자가 그
   * 화면을 봤고, **아카이브도 없는데 아카이브를 가리키고** 있었습니다.
   *
   * service 로는 안 잡히는 결함입니다 — 문구는 화면에만 있습니다.
   */
  if (goneSlug) {
    const r = await get(`/resources/github-repo/${encodeURI(goneSlug)}`);
    const html = r ? await r.text() : "";
    check("못 읽은 저장소 상세가 열린다", r?.status === 200, `${r?.status}`);
    check(
      "«읽지 못했다»고 말한다",
      html.includes("읽지 못했습니다"),
      "한 번도 못 읽은 저장소에 «사라졌다»는 거짓이다"
    );
    check("«사라졌다»고 하지 않는다", !html.includes("원본이 사라졌습니다"));
    check(
      "없는 아카이브를 가리키지 않는다",
      !html.includes("아래 아카이브를"),
      "아카이브가 없는데 이용하라고 하면 갈 곳이 없다"
    );
  }

  const p = parseResourceInput({
    type: "GITHUB_REPO",
    title: "화면 관통 검증",
    summary: "",
    url: "https://github.com/octocat/Spoon-Knife",
    body: "",
    category: "",
    tags: "",
  });
  if (!p.ok) throw new Error(JSON.stringify(p.fieldErrors));
  const res = await resourceWrite.create(actorOfId(userId), p.data);
  madeResources.push(res.id);

  const job = await jobService.enqueue({
    type: "FETCH_GITHUB_META",
    resourceId: res.id,
  });
  await jobService.runNow(job.id);
  const meta = await jobOf(job.id);

  /*
   * **한국어 slug 회귀 검사.** `P4` 가 slug 에 한글을 남기기로 했으므로
   * (라틴만 남기면 「검증용 AI 자료」가 `-ai-` 가 됩니다) 이 경로가 살아 있어야
   * 팀이 쓰는 대부분의 자료가 열립니다.
   */
  check("slug 에 한글이 남아 있다", /[가-힣]/.test(res.slug), res.slug);

  const detail = await get(
    `/resources/github-repo/${encodeURIComponent(res.slug)}`
  );
  if (!detail) {
    check("상세 화면이 열린다", false, "dev 서버가 꺼져 있습니다");
    return;
  }
  const html = (await detail.text()).replaceAll("<!-- -->", "");
  check(
    "한국어 slug 로 상세가 열린다",
    detail.status === 200 && !html.includes(NOT_FOUND),
    `HTTP ${detail.status}${html.includes(NOT_FOUND) ? " · 본문은 404" : ""}`
  );

  /*
   * **본문에만 나오는 문자열로 봅니다.** 자료 제목은 커맨드 팔레트 색인에도
   * 있어서 404 페이지에서도 잡힙니다 — 실제로 그것에 속았습니다.
   */
  check("GitHub 상세 카드가 그려진다", html.includes("저장소 정보"));
  check(
    "owner/repo 가 화면에 나온다",
    html.includes("octocat"),
    "등록 시점에 URL 에서 넣는 값이다"
  );
  check(
    "메타 갱신·아카이브 버튼이 있다",
    html.includes("메타 갱신"),
    "canEdit 인데 안 보이면 배선이 끊긴 것"
  );

  if (meta.status === "DONE") {
    const row = await db.githubRepo.findUniqueOrThrow({
      where: { resourceId: res.id },
      select: { stars: true, readmeContent: true, fileTree: true },
    });
    /*
     * 화면은 `toLocaleString()` 으로 그립니다 — `13997` 이 아니라 `13,997`.
     * 원시 숫자로 찾다가 「코드는 맞는데 검사가 틀린」 실패를 한 번 봤습니다.
     */
    check(
      "수집한 스타 수가 화면에 나온다",
      html.includes(row.stars!.toLocaleString()),
      `${row.stars?.toLocaleString()}`
    );

    /*
     * ★ **받아 두고 안 그리면 안 받은 것과 같습니다.**
     *
     * `readme_content` 는 `P6` 부터 채워지고 있었는데 **화면에 한 번도
     * 그려진 적이 없었습니다.** DB 에는 있고 사람은 못 보는 상태가 여러
     * 페이즈를 지나 살아 있었습니다 — 「수집했다」는 작업 로그만 보고
     * 화면을 안 봤기 때문입니다(`P6` DoD 가 화면을 보게 만든 이유).
     *
     * 파일 목록도 같은 자리에 새로 생겼으므로 함께 봅니다.
     */
    check("README 를 받아 왔다", (row.readmeContent?.length ?? 0) > 0);
    check(
      "README 가 화면에 그려진다",
      html.includes("README"),
      "DB 에만 있고 화면에 없으면 안 받은 것과 같다"
    );

    const files = Array.isArray(row.fileTree) ? row.fileTree : [];
    check(
      "최상위 파일 목록을 받아 왔다",
      files.length > 0,
      `${files.length}개`
    );
    check(
      "파일 이름이 화면에 나온다",
      html.includes("README.md"),
      "Spoon-Knife 최상위에 있는 파일이다"
    );
    check(
      "몇 개인지 말한다",
      html.includes(`최상위 ${files.length}개`),
      "목록이 잘렸는지 사람이 알 수 있어야 한다"
    );
  } else {
    console.log(`       (GitHub 한도로 건너뜀 — ${meta.errorMessage})`);
  }

  /*
   * **아카이브가 없을 때 «왜 없는지»를 말합니다.** 404 로 뭉뚱그리면
   * 사람이 「고장인가?」로 읽습니다.
   */
  const noArchive = await get(`/api/resources/${res.id}/archive`);
  check(
    "아카이브가 없으면 409 와 안내",
    noArchive?.status === 409,
    `HTTP ${noArchive?.status}`
  );
  const msgText = noArchive ? await noArchive.text() : "";
  check(
    "무엇을 해야 하는지 말한다",
    msgText.includes("상세에서 실행"),
    msgText
  );

  // 첨부를 HTTP 로 올리고 다시 받는다 — 라우트가 실제로 스트리밍하는가
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const up = await fetch(
    `${BASE}/api/files?resourceId=${encodeURIComponent(res.id)}`,
    {
      method: "POST",
      headers: {
        cookie,
        "x-filename": encodeURIComponent("스크린샷.png"),
        "content-type": "image/png",
      },
      body: PNG,
    }
  );
  check("업로드 라우트가 201 을 준다", up.status === 201, `HTTP ${up.status}`);
  const uploaded = (await up.json()) as { data?: { id: string } };
  const fileId = uploaded.data?.id;
  check("첨부 id 를 돌려준다", Boolean(fileId));

  if (fileId) {
    const down = await get(`/api/files/${fileId}`);
    check("다운로드가 200 이다", down?.status === 200, `HTTP ${down?.status}`);
    check(
      "실행되지 않게 내려준다 (NFR-SEC-020)",
      down?.headers.get("x-content-type-options") === "nosniff" &&
        (down?.headers.get("content-disposition") ?? "").startsWith(
          "attachment"
        ),
      down?.headers.get("content-disposition") ?? ""
    );
    check(
      "한글 이름이 살아 있다",
      (down?.headers.get("content-disposition") ?? "").includes(
        encodeURIComponent("스크린샷.png")
      )
    );
    check("Range 를 받는다", down?.headers.get("accept-ranges") === "bytes");

    const partial = await get(`/api/files/${fileId}`, { range: "bytes=0-3" });
    check(
      "부분 요청이 206 이다",
      partial?.status === 206,
      `HTTP ${partial?.status}`
    );
    check(
      "구간이 맞다",
      partial?.headers.get("content-range") === `bytes 0-3/${PNG.length}`,
      partial?.headers.get("content-range") ?? ""
    );

    // 로그인 없이는 못 받는다 (`NFR-SEC-021`)
    const anon = await fetch(`${BASE}/api/files/${fileId}`);
    check(
      "로그인 없이는 못 받는다",
      anon.status === 401,
      `HTTP ${anon.status}`
    );
  }
}

const actorOfId = (id: string): Actor => ({
  id,
  username: "verify",
  via: "WEB",
});

async function cleanup() {
  // **작업 행을 먼저** — `resourceId` 로 자료를 가리킵니다
  await db.job.deleteMany({ where: { createdAt: { gte: startedAt } } });

  for (const k of madeKeys) await storage.remove(k).catch(() => {});
  if (madeResources.length) {
    await db.resource.deleteMany({ where: { id: { in: madeResources } } });
  }
  /*
   * **파일을 먼저 지웁니다.** `files.uploaded_by` 가 `users` 를 가리키는데
   * `onDelete` 가 없어(기본 `Restrict`) 사용자 삭제가 막힙니다 —
   * `resource_files` 는 자료 삭제로 정리되지만 `files` 행은 남습니다.
   */
  if (madeUsers.length) {
    await db.resourceFile.deleteMany({
      where: { file: { uploadedById: { in: madeUsers } } },
    });
    await db.file.deleteMany({ where: { uploadedById: { in: madeUsers } } });
    await db.user.deleteMany({ where: { id: { in: madeUsers } } });
  }
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
