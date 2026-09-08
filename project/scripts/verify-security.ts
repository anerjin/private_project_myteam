/**
 * 보안 점검 (`M6`) — `NFR-SEC-001`~`021`.
 *
 *   npm run verify:sec   (`npm run dev` 가 떠 있어야 합니다)
 *
 * ## 여기서 «다시» 세지 않는 것
 *
 * 21건 중 아홉은 이미 다른 스크립트가 관통했습니다. 같은 사실을 두 곳에 두면
 * 한쪽이 낡아도 아무도 모릅니다 — 여기서는 **어디서 증명되는지만** 적고
 * 넘어갑니다 (아래 `ELSEWHERE`).
 *
 * ## 「막혔다」가 아니라 «무엇으로» 막혔는지 봅니다
 *
 * 예를 들어 SSRF 는 「요청이 실패했다」로는 통과시키지 않습니다 — 네트워크가
 * 없어도 실패하기 때문입니다. **`UnsafeUrlError` 가 났는가**를 봅니다.
 * `DEC-044` 「0건은 증거가 아니다」와 같은 자리입니다.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { db } from "@/lib/db";
import { UnsafeUrlError, assertPublicUrl } from "@/lib/safe-fetch";
import { hashPassword } from "@/server/auth/password";
import { issue as issueSession } from "@/server/auth/session";

const BASE = "http://localhost:3100";
const COOKIE = process.env.SESSION_COOKIE_NAME || "nw_session";
const ROOT = path.resolve(import.meta.dirname, "..");

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(
    `${ok ? "  OK  " : "  실패"} ${label}${detail ? " — " + detail : ""}`
  );
  if (ok) pass++;
  else fail++;
}

/** 이미 증명된 것 — **다시 세지 않고 가리키기만** 합니다 */
const ELSEWHERE: Record<string, string> = {
  "NFR-SEC-002 무차별 대입 방어": "verify:p3",
  "NFR-SEC-008 비밀값 유입 차단": "verify:p7",
  "NFR-SEC-009 파일 업로드 3중 검증": "verify:p6",
  "NFR-SEC-016 에러 노출": "verify:p7",
  "NFR-SEC-017 API 키": "verify:p3-keys",
  "NFR-SEC-018 Ingest 격리": "verify:p7 · verify:p7-mcp",
  "NFR-SEC-019 파일 경로 이탈": "verify:p6",
  "NFR-SEC-020 파일 응답 헤더": "verify:p6",
  "NFR-SEC-021 파일 접근 통제": "verify:p6",
  "NFR-SEC-005 세션 쿠키 속성": "e2e (브라우저만이 진짜 Set-Cookie 를 본다)",
};

const madeUsers: string[] = [];
const madeResources: string[] = [];

async function mkUser(tag: string) {
  const u = await db.user.create({
    data: {
      username: `vsec_${tag}_${randomBytes(4).toString("hex")}`,
      passwordHash: await hashPassword("Verify!12345"),
      name: `보안검증-${tag}`,
      status: "ACTIVE",
    },
    select: { id: true, username: true },
  });
  madeUsers.push(u.id);
  return u;
}

async function get(pathname: string, cookie?: string) {
  for (let i = 0; i < 2; i++) {
    const res = await fetch(BASE + pathname, {
      headers: cookie ? { cookie } : {},
      redirect: "manual",
    });
    if (res.status !== 500) {
      const body = res.status === 200 ? await res.text() : "";
      return { status: res.status, headers: res.headers, body };
    }
  }
  return { status: 500, headers: new Headers(), body: "" };
}

/** 던진 «오류의 종류»를 돌려준다 — 「실패했다」와 「거부했다」는 다른 사실이다 */
async function threw(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "(예외 없음)";
  } catch (e) {
    return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }
}

async function run() {
  /* ── NFR-SEC-001 · 비밀번호는 Argon2id 해시로만 ──────────────────── */
  console.log("\n[NFR-SEC-001] 비밀번호 저장");
  {
    const rows = await db.user.findMany({ select: { passwordHash: true } });
    const bad = rows.filter((r) => !r.passwordHash.startsWith("$argon2id$"));
    /*
     * **전수입니다.** 「새로 만든 계정이 argon2 다」는 증거가 약합니다 —
     * 문제는 언제나 **예전에 다른 방식으로 들어간 행**입니다.
     */
    check(
      `모든 계정이 Argon2id (${rows.length}건)`,
      rows.length > 0 && bad.length === 0,
      bad.length ? `${bad.length}건이 아님` : ""
    );
  }

  /* ── NFR-SEC-003 · 인가 (대표 경로) ─────────────────────────────── */
  console.log("\n[NFR-SEC-003] 인가 — 권한 매트릭스 전체는 verify:p3 · p8");
  {
    const anon = await get("/admin/members");
    check(
      "비로그인은 관리 화면에 못 닿는다",
      anon.status !== 200,
      `${anon.status}`
    );
    const anonApi = await get("/api/ingest/whoami");
    check("비인증 Ingest 는 401", anonApi.status === 401, `${anonApi.status}`);
    /*
     * 🔄 여기는 **「`MEMBER` 세션도 관리 화면에 못 닿는다」**였습니다.
     *    `DEC-077` 로 사람이 전부 관리자가 되어 그 시나리오는 재현할 수 없습니다 —
     *    관리 영역을 가르는 것은 이제 등급이 아니라 **로그인 여부**입니다.
     *
     *    그래서 «남은» 문을 봅니다: **세션이 죽으면 못 닿는다.** 정지는 세션 행을
     *    같은 트랜잭션에서 지우므로(`DEC-036`), 정지된 계정의 쿠키는 그 즉시
     *    관리 화면을 열지 못해야 합니다. 이것이 「인가 = 인증」이 된 뒤 남은
     *    유일한 차단선이고, 여기가 뚫리면 정지가 아무 뜻도 없습니다.
     */
    const member = await mkUser("member");
    const suspender = await mkUser("suspender");
    const { token } = await issueSession(member.id, {
      userAgent: "verify-sec",
    });
    const memberService = await import("@/server/services/member.service");
    await memberService.transition(
      { id: suspender.id, username: suspender.username, via: "WEB" },
      member.id,
      { kind: "SUSPEND", reason: "보안 검증을 위한 정지입니다." }
    );
    const asSuspended = await get("/admin/members", `${COOKIE}=${token}`);
    check(
      "정지된 계정의 세션은 관리 화면에 못 닿는다",
      asSuspended.status !== 200,
      `${asSuspended.status}`
    );
  }

  /* ── NFR-SEC-004 · 전송 구간 ────────────────────────────────────── */
  console.log("\n[NFR-SEC-004] 전송 구간 — 1단계는 http (DEC-013·017)");
  {
    /*
     * **「HTTPS 다」를 검사하지 않습니다.** 1단계는 개발 PC 의 `http` 이고
     * 그건 결정된 사실입니다. 여기서 볼 것은 **2단계에 켤 스위치가 있는가** —
     * `COOKIE_SECURE` 가 코드에 박혀 있으면 그때 코드를 고쳐야 합니다.
     */
    const envExample = path.join(ROOT, ".env.example");
    const hasSwitch =
      existsSync(envExample) &&
      readFileSync(envExample, "utf8").includes("COOKIE_SECURE");
    check("COOKIE_SECURE 가 환경변수로 열려 있다", hasSwitch);
  }

  /* ── NFR-SEC-006 · 서버에서 zod 재검증 ──────────────────────────── */
  console.log("\n[NFR-SEC-006] 입력 검증");
  {
    /*
     * 화면을 거치지 않고 **API 로** 깨진 본문을 보냅니다. 클라이언트 검증만
     * 있으면 여기서 통과해 버립니다 — 그게 이 항목이 막으려는 것입니다.
     *
     * 여기서 볼 것은 **거절의 «모양»** 입니다. 500 이면 서버가 던진 것이고,
     * 그건 검증이 아니라 사고입니다 (`NFR-SEC-016` 도 함께 깨집니다).
     */
    for (const body of ['{"아무거나":true}', "{", "[]", '"문자열"']) {
      const res = await fetch(`${BASE}/api/ingest/resources`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // 헤더 값은 ByteString 입니다 — 한글을 넣으면 `fetch` 가 던집니다
          authorization: "Bearer nw_no_such_key",
        },
        body,
      });
      check(
        `깨진 본문이 500 이 아니다: ${body.slice(0, 14)}`,
        res.status !== 500,
        `${res.status}`
      );
    }
  }

  /* ── NFR-SEC-007 · XSS (마크다운 sanitize) ──────────────────────── */
  console.log("\n[NFR-SEC-007] XSS");
  {
    const author = await mkUser("xss");
    const slug = `vsec-xss-${randomBytes(4).toString("hex")}`;
    const r = await db.resource.create({
      data: {
        type: "DEV_NOTE",
        slug,
        title: "보안검증 XSS",
        summary: "sanitize 확인",
        body: `<script>alert(1)</script>\n\n<img src=x onerror="alert(2)">\n\n[클릭](javascript:alert(3))`,
        status: "PUBLISHED",
        authorId: author.id,
        devNote: { create: { noteKind: "TIP" } },
      },
      select: { id: true },
    });
    madeResources.push(r.id);

    const { token } = await issueSession(author.id, {
      userAgent: "verify-sec",
    });
    const page = await get(`/resources/dev-note/${slug}`, `${COOKIE}=${token}`);
    check("상세가 열린다", page.status === 200, `${page.status}`);

    /*
     * **«태그»를 찾습니다 — 문자열이 아니라.**
     *
     * 처음에는 `body.includes("onerror=")` 로 봤고 실패했습니다. 찾아보니
     * 유일한 등장은 RSC 페이로드 안이었고 이렇게 생겼습니다:
     *
     *   <img src=x onerror=\"alert(2)\">
     *
     * 꺾쇠가 `<` 라 **태그가 아니라 JSON 문자열**입니다 — 원문 마크다운이
     * 클라이언트로 실려 간 것뿐이고, 화면에 그려질 때는 `rehype-sanitize` 를
     * 지납니다. 즉 **화면은 멀쩡했고 검사가 틀렸습니다** (이 저장소에서 다섯
     * 번째입니다). 이제 «실행될 수 있는 모양»만 봅니다.
     */
    check(
      "<script> 태그로 살아 나가지 않는다",
      !/<script[^>]*>\s*alert\(1\)/i.test(page.body)
    );
    check(
      "onerror 를 «단 img 태그»가 없다",
      !/<img[^>]*\sonerror/i.test(page.body)
    );
    check(
      "javascript: 링크가 남지 않는다",
      !/href="javascript:/i.test(page.body)
    );
    // 원문이 «이스케이프되어» 실려 갔다는 것 자체도 확인합니다
    check(
      "원문은 이스케이프된 데이터로만 있다",
      page.body.includes("\\u003cscript\\u003e") ||
        page.body.includes("u003cscript")
    );
  }

  /* ── NFR-SEC-010 · SSRF ─────────────────────────────────────────── */
  console.log("\n[NFR-SEC-010] SSRF");
  {
    /*
     * **요구사항이 이름 붙인 다섯 대역**을 그대로 찔러 봅니다.
     * 「예외가 났다」가 아니라 **`UnsafeUrlError` 인가**를 봅니다 — 네트워크가
     * 없어도 `fetch` 는 실패하므로, 종류를 안 보면 아무것도 증명하지 못합니다.
     */
    const blocked = [
      "http://127.0.0.1:5432/",
      "http://10.0.0.1/",
      "http://172.16.0.1/",
      "http://192.168.0.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://localhost/",
      "http://[::1]/",
      "http://0.0.0.0/",
      "file:///etc/passwd",
    ];
    for (const u of blocked) {
      const e = await threw(() => assertPublicUrl(u));
      check(`거부: ${u}`, e.startsWith("UnsafeUrlError"), e.slice(0, 60));
    }
    const ok = await threw(() => assertPublicUrl("https://github.com/octocat"));
    check("바깥 주소는 통과한다", ok === "(예외 없음)", ok.slice(0, 60));
    check(
      "UnsafeUrlError 가 실제로 구별된다",
      new UnsafeUrlError("x") instanceof Error
    );

    /*
     * **예외는 «오리진 하나»만 엽니다.**
     *
     * 링크 확인 배치는 `APP_URL` 을 예외로 둡니다 — 그 검증이 네트워크에
     * 안 기대려고 자기 자신을 링크로 쓰기 때문입니다. 여는 단위가 «호스트»가
     * 되면 같은 PC 의 Postgres·Redis 까지 열립니다. 그래서 «호스트:포트» 여야
     * 하고, 그것이 실제로 그런지 여기서 봅니다.
     */
    const SELF = [new URL(BASE).origin];
    const selfOk = await threw(() =>
      assertPublicUrl(`${BASE}/api/health`, SELF)
    );
    check(
      "예외에 든 오리진은 통과한다",
      selfOk === "(예외 없음)",
      selfOk.slice(0, 50)
    );
    for (const near of [
      "http://localhost:5433/",
      "http://localhost:6380/",
      "http://127.0.0.1:3100/",
    ]) {
      const e = await threw(() => assertPublicUrl(near, SELF));
      check(
        `예외가 옆으로 새지 않는다: ${near}`,
        e.startsWith("UnsafeUrlError"),
        e.slice(0, 40)
      );
    }
  }

  /* ── NFR-SEC-011 · 오픈 리다이렉트 ──────────────────────────────── */
  console.log("\n[NFR-SEC-011] 오픈 리다이렉트");
  {
    /*
     * `safeNext` 는 내부 함수라 «화면으로» 봅니다 — 로그인 화면이 외부 주소를
     * 들고 있어도, 로그인 뒤 목적지는 서버가 정합니다.
     */
    const evil = await get("/login?next=https://evil.example/steal");
    check(
      "외부 next 가 붙어도 로그인 화면은 200",
      evil.status === 200,
      `${evil.status}`
    );
    check(
      "외부 주소가 폼 action 으로 새지 않는다",
      !evil.body.includes("evil.example/steal") ||
        !/action="https:\/\/evil\.example/.test(evil.body)
    );
    // 보호 경로로 튕길 때 next 는 «내부 경로»만 담긴다
    const bounced = await get("/dashboard");
    const loc = bounced.headers.get("location") ?? "";
    check(
      "튕길 때 next 는 내부 경로",
      loc.includes("next=%2Fdashboard") || loc.includes("next=/dashboard"),
      loc.slice(0, 70)
    );
  }

  /* ── NFR-SEC-012 · 비밀 관리 ────────────────────────────────────── */
  console.log("\n[NFR-SEC-012] 비밀 관리");
  {
    const tracked = execFileSync("git", ["ls-files", "project/.env"], {
      cwd: path.resolve(ROOT, ".."),
      encoding: "utf8",
    }).trim();
    check(".env 가 git 에 없다", tracked === "", tracked);
    check(".env.example 이 있다", existsSync(path.join(ROOT, ".env.example")));
  }

  /* ── NFR-SEC-013 · 의존성 ───────────────────────────────────────── */
  /*
   * **`package.json` 의 `overrides` 가 왜 있는지 여기 적어 둡니다** — JSON 에는
   * 주석을 달 수 없어서입니다.
   *
   * `deepmerge-ts@7.1.5` 에 스택 고갈(GHSA-ggr8-5vv4-36mx)이 있고,
   * `@prisma/config` 가 그 버전을 **정확히 못 박아** 두어 `prisma` 까지
   * 세 줄로 올라옵니다. `npm audit fix --force` 가 제안하는 것은
   * **Prisma 를 6.12 로 되돌리는 것**이라 받을 수 없습니다.
   *
   * 그래서 `overrides` 로 `deepmerge-ts` 만 8 로 올렸습니다. 확인한 것:
   * `npx prisma validate` 가 `prisma.config.ts` 를 그대로 읽고, 마이그레이션과
   * 시드가 돕니다. **Prisma 를 올릴 때 이 override 를 지워 보십시오** —
   * 상류가 스스로 올렸으면 더 둘 이유가 없습니다.
   */
  console.log("\n[NFR-SEC-013] 의존성");
  {
    let high = -1;
    try {
      const out = execFileSync("npm", ["audit", "--json"], {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
        shell: true,
      });
      const j = JSON.parse(out);
      high =
        (j.metadata?.vulnerabilities?.high ?? 0) +
        (j.metadata?.vulnerabilities?.critical ?? 0);
    } catch (e) {
      // `npm audit` 은 취약점이 있으면 종료 코드가 0이 아닙니다 — 출력은 그대로 옵니다
      const out = (e as { stdout?: string }).stdout ?? "";
      try {
        const j = JSON.parse(out);
        high =
          (j.metadata?.vulnerabilities?.high ?? 0) +
          (j.metadata?.vulnerabilities?.critical ?? 0);
      } catch {
        high = -1;
      }
    }
    check(
      "High 이상 취약점 0건",
      high === 0,
      high < 0 ? "audit 을 못 읽음" : `${high}건`
    );
  }

  /* ── NFR-SEC-014 · 보안 헤더 ────────────────────────────────────── */
  console.log("\n[NFR-SEC-014] 보안 헤더");
  {
    const res = await get("/login");
    const h = res.headers;
    const csp = h.get("content-security-policy") ?? "";
    check("Content-Security-Policy 가 있다", csp.length > 0);
    check(
      "X-Frame-Options: DENY",
      h.get("x-frame-options") === "DENY",
      h.get("x-frame-options") ?? "없음"
    );
    check(
      "X-Content-Type-Options: nosniff",
      h.get("x-content-type-options") === "nosniff",
      h.get("x-content-type-options") ?? "없음"
    );
    check(
      "Referrer-Policy 가 있다",
      (h.get("referrer-policy") ?? "").length > 0
    );
    check("X-Powered-By 를 흘리지 않는다", h.get("x-powered-by") === null);

    /*
     * **CSP 의 «내용»을 봅니다.** 헤더가 있다는 것만으로는 아무것도 막지
     * 않습니다 — `script-src` 에 `'unsafe-inline'` 이 있으면 주입된 스크립트가
     * 그대로 실행됩니다. 그 경우 헤더는 «있는데 막는 것이 없는» 상태입니다.
     */
    const scriptSrc = /script-src ([^;]+)/.exec(csp)?.[1] ?? "";
    check(
      "script-src 에 'unsafe-inline' 이 없다",
      !scriptSrc.includes("'unsafe-inline'"),
      scriptSrc.slice(0, 80)
    );
    check(
      "script-src 에 요청별 nonce 가 있다",
      /'nonce-[^']+'/.test(scriptSrc)
    );
    check("frame-ancestors 'none'", csp.includes("frame-ancestors 'none'"));
    check("object-src 'none'", csp.includes("object-src 'none'"));
    check("form-action 'self'", csp.includes("form-action 'self'"));
    /*
     * `upgrade-insecure-requests` 는 **1단계에 있으면 안 됩니다.** 사내망을
     * 열면 주소가 `http://192.168.x.x:3100` 이 되는데(`DEC-023`), 이 지시어가
     * 그 하위 요청을 전부 https 로 올려 앱을 통째로 죽입니다.
     */
    check(
      "upgrade-insecure-requests 가 없다 (1단계는 http)",
      !csp.includes("upgrade-insecure-requests")
    );

    // nonce 는 **요청마다 달라야** 합니다 — 고정이면 nonce 가 아닙니다
    const again = await get("/login");
    const csp2 = again.headers.get("content-security-policy") ?? "";
    const n1 = /'nonce-([^']+)'/.exec(csp)?.[1];
    const n2 = /'nonce-([^']+)'/.exec(csp2)?.[1];
    check("nonce 가 요청마다 바뀐다", Boolean(n1 && n2 && n1 !== n2));

    // 리다이렉트 응답에도 붙는가 — 「대부분의 응답에 있다」는 의미가 없다
    const bounced = await get("/dashboard");
    check(
      "리다이렉트 응답에도 헤더가 붙는다",
      bounced.headers.get("x-frame-options") === "DENY",
      `${bounced.status}`
    );
  }

  /* ── NFR-SEC-015 · 감사 추적 ────────────────────────────────────── */
  console.log("\n[NFR-SEC-015] 감사 추적");
  {
    /*
     * 🔄 「역할 변경이 감사 로그를 남긴다」였습니다. `DEC-077` 로 그 전이가
     *    사라져 **정지**로 봅니다 — 남은 전이 중 사유를 받는 것이고,
     *    사유가 감사 로그에만 남는다는 점에서 추적이 가장 중요한 쪽입니다.
     */
    const admin = await mkUser("auditor");
    const target = await mkUser("victim");
    const before = await db.auditLog.count();
    const memberService = await import("@/server/services/member.service");
    await memberService.transition(
      { id: admin.id, username: admin.username, via: "WEB" },
      target.id,
      { kind: "SUSPEND", reason: "감사 추적 검증을 위한 정지입니다." }
    );
    const after = await db.auditLog.count();
    check(
      "상태 변경이 감사 로그를 남긴다",
      after > before,
      `${before} → ${after}`
    );
  }

  /* ── 다른 곳에서 증명된 것 ──────────────────────────────────────── */
  console.log("\n[다른 곳에서 증명됨] — 여기서 다시 세지 않습니다");
  for (const [item, where] of Object.entries(ELSEWHERE)) {
    console.log(`  ·    ${item} → ${where}`);
  }

  console.log(`\n합계: 통과 ${pass} · 실패 ${fail}`);
}

async function cleanup() {
  if (madeResources.length) {
    await db.resource.deleteMany({ where: { id: { in: madeResources } } });
  }
  if (madeUsers.length) {
    await db.auditLog.deleteMany({ where: { actorId: { in: madeUsers } } });
    await db.session.deleteMany({ where: { userId: { in: madeUsers } } });
    await db.notification.deleteMany({ where: { userId: { in: madeUsers } } });
    await db.user.deleteMany({ where: { id: { in: madeUsers } } });
  }
}

run()
  .catch((e) => {
    console.error(e);
    fail++;
  })
  .finally(async () => {
    // 정리는 반드시 돕니다 — 남기면 다음 실행이 「이미 있다」로 시작합니다
    await cleanup();
    await db.$disconnect();
    process.exit(fail > 0 ? 1 : 0);
  });
