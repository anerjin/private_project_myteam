/**
 * P3 검증 — 아키텍트 8단계 체크리스트.
 *
 * **화면으로 확인합니다.** `[018]` C1 의 교훈이 정확히 여기였습니다 —
 * service 를 직접 불러 본 것은 화면 검증이 아닙니다. 그래서 페이지 항목은
 * **실제 dev 서버에 세션 쿠키를 들고 HTTP 로 요청해** 응답과 본문을 봅니다.
 */
import { randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/server/auth/actor";
import { issue } from "@/server/auth/session";
import { hashPassword } from "@/server/auth/password";
import * as authService from "@/server/services/auth.service";
import * as memberService from "@/server/services/member.service";

const BASE = "http://localhost:3100";
const COOKIE = process.env.SESSION_COOKIE_NAME || "nw_session";
const PASSWORD = "Verify!12345";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(
    `${ok ? "  OK  " : "  실패"} ${label}${detail ? " — " + detail : ""}`
  );
  if (ok) pass++;
  else fail++;
}

let hash: string;
const made: string[] = [];

async function makeUser(
  tag: string,
  status: "ACTIVE" | "SUSPENDED" | "WITHDRAWN",
  statusReason?: string
) {
  const u = await db.user.create({
    data: {
      username: `vp3_${tag}_${randomBytes(4).toString("hex")}`,
      passwordHash: hash,
      name: `검증-${tag}`,
      department: "검증팀",
      status,
      statusReason,
    },
    select: { id: true, username: true, name: true },
  });
  made.push(u.id);
  return u;
}

function actorOf(u: { id: string; username: string }): Actor {
  return { id: u.id, username: u.username, via: "WEB" };
}

/** 로그인 성공 후와 같은 방법으로 세션을 발급해 쿠키로 만든다 */
async function cookieFor(userId: string): Promise<string> {
  const { token } = await issue(userId, { userAgent: "verify-p3" });
  return `${COOKIE}=${token}`;
}

async function get(path: string, cookie?: string) {
  const res = await fetch(BASE + path, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  /*
   * React 는 텍스트와 표현식 사이에 `<!-- -->` 를 넣습니다 —
   * `전체 {n}건` 은 HTML 에서 `전체 <!-- -->2<!-- -->건` 입니다.
   * 지우지 않으면 **화면에 제대로 나오는 값을 「안 나온다」고 판정**합니다.
   */
  const raw = res.status === 200 ? await res.text() : "";
  return {
    status: res.status,
    location: res.headers.get("location"),
    body: raw.replaceAll("<!-- -->", ""),
  };
}

async function messageOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "(오류 없음)";
  } catch (e) {
    return e instanceof AppError ? e.message : `(${String(e)})`;
  }
}

async function run() {
  hash = await hashPassword(PASSWORD);

  const admin = await makeUser("admin", "ACTIVE", "ADMIN");
  const admin2 = await makeUser("admin2", "ACTIVE", "ADMIN"); // 마지막 관리자 보호 회피용
  const adminActor = actorOf(admin);
  const adminCookie = await cookieFor(admin.id);

  console.log("\n① 탈퇴 계정이 존재를 노출하지 않는가 (NFR-SEC-016)");
  {
    const gone = await makeUser("withdrawn", "WITHDRAWN");
    const msg = await messageOf(() =>
      authService.signIn(gone.username, PASSWORD, undefined, {})
    );
    check(
      "「존재하지 않는 계정입니다」",
      msg === "존재하지 않는 계정입니다.",
      msg
    );
  }

  console.log("\n② 목록 → 상세가 404 가 아닌가");
  {
    const target = await makeUser("detail", "ACTIVE");
    const list = await get("/admin/members", adminCookie);
    check("회원 목록이 열린다", list.status === 200, `${list.status}`);
    check(
      "목록에 실제 회원 링크가 있다",
      list.body.includes(`/admin/members/${target.id}`)
    );
    const detail = await get(`/admin/members/${target.id}`, adminCookie);
    check("상세가 열린다", detail.status === 200, `${detail.status}`);
    check("상세에 이름이 보인다", detail.body.includes(target.name));
  }

  console.log("\n③ 지금 상태에서 갈 수 없는 전이는 거부되는가");
  {
    /*
     * 🔄 여기는 **「같은 역할로 변경」**이었습니다 — 아무것도 안 바꾸는 전이가
     *    세션만 끊고 `before === after` 인 감사 로그를 남기는 것을 막는 검사입니다.
     *    `DEC-077` 로 역할 변경이 사라지면서 그 재현 경로가 없어졌고, 남은 셋은
     *    전부 상태를 바꿉니다. 그래서 **같은 성질의 거부**(`spec.from` 위반)를
     *    봅니다 — 거부된 전이가 세션을 끊지 않는다는 것이 이 검사의 값입니다.
     */
    const u = await makeUser("noop", "ACTIVE");
    const msg = await messageOf(() =>
      memberService.transition(adminActor, u.id, { kind: "REACTIVATE" })
    );
    check(
      "ACTIVE 인 계정의 정지 해제는 거부된다",
      msg.includes("할 수 없는 상태입니다"),
      msg
    );
    const sessions = await db.session.count({ where: { userId: u.id } });
    check("거부됐으므로 세션도 안 끊긴다", sessions === 0, `${sessions}`);
  }

  console.log("\n④ 비밀번호 초기화 — 자기 자신·차단 계정");
  {
    const self = await messageOf(() =>
      memberService.resetPassword(adminActor, admin.id, "x", hashPassword)
    );
    check("자기 자신에게는 못 건다", self.includes("마이페이지"), self);

    /*
     * 전에는 `REJECTED` 로 봤습니다. 그 상태가 `DEC-077` 로 없어졌으므로
     * 같은 성질(로그인 자체가 막힌 계정)인 `WITHDRAWN` 으로 봅니다 —
     * 초기화해 봐야 쓸 수 없고, 1년 뒤 익명화 대상에 새 해시를 찍는 셈입니다.
     */
    const gone = await makeUser("reset-gone", "WITHDRAWN");
    const blocked = await messageOf(() =>
      memberService.resetPassword(adminActor, gone.id, "x", hashPassword)
    );
    check(
      "탈퇴한 계정에는 못 건다",
      blocked.includes("초기화할 수 없는 상태"),
      blocked
    );
  }

  console.log("\n⑤ 감사 로그가 롤백과 운명을 같이하는가 (DEC-043)");
  {
    const u = await makeUser("audit", "ACTIVE");
    const before = await db.auditLog.count({ where: { targetId: u.id } });
    // 마지막 관리자가 아니므로 성공해야 한다 → 로그가 «같은 커밋»에 남는다
    await memberService.transition(adminActor, u.id, {
      kind: "SUSPEND",
      reason: "검증용 정지입니다. 곧 해제합니다.",
    });
    const after = await db.auditLog.count({ where: { targetId: u.id } });
    check(
      "성공하면 감사 로그가 남는다",
      after === before + 1,
      `${before}→${after}`
    );

    // 실패(INVALID_STATE)하면 로그도 없어야 한다
    const failMsg = await messageOf(() =>
      memberService.transition(adminActor, u.id, {
        kind: "SUSPEND",
        reason: "이미 정지된 계정에 다시 정지를 겁니다.",
      })
    );
    const after2 = await db.auditLog.count({ where: { targetId: u.id } });
    check(
      "실패하면 감사 로그가 남지 않는다",
      after2 === after,
      `${failMsg} / ${after}→${after2}`
    );
  }

  console.log("\n⑥ 관리자 대시보드의 회원 수가 실데이터인가 (DEC-038)");
  {
    /*
     * **여기서 재던 것은 「승인 대기 N건」 배지였습니다** (`DEC-038` 의 예시).
     * 그 숫자가 `DEC-077` 로 사라졌으므로 같은 성질의 남은 숫자를 봅니다 —
     * 「전체 회원」은 여전히 `users` 를 세고, 화면과 서비스가 같은 함수를 지납니다.
     * 배지가 없어졌다고 «화면이 실데이터를 보는가»라는 질문까지 버리지 않습니다.
     */
    const dbCount = await db.user.count({
      where: { status: { not: "WITHDRAWN" } },
    });
    const svc = await memberService.countAll();
    check("countAll 이 DB 와 같다", svc === dbCount, `${svc} vs ${dbCount}`);
    const page = await get("/admin", adminCookie);
    check("관리자 대시보드가 열린다", page.status === 200, `${page.status}`);
    check(
      `대시보드가 전체 회원 ${dbCount}명을 보여준다`,
      page.body.includes(`${dbCount}`)
    );
  }

  // ── 정리 ────────────────────────────────────────────
  void admin2;
  await db.auditLog.deleteMany({ where: { actorId: { in: made } } });
  await db.auditLog.deleteMany({ where: { targetId: { in: made } } });
  await db.notification.deleteMany({ where: { userId: { in: made } } });
  await db.session.deleteMany({ where: { userId: { in: made } } });
  await db.user.deleteMany({ where: { id: { in: made } } });
  await redis.del(...made.map((id) => `user:gen:${id}`));

  console.log(`\n합계: 통과 ${pass} · 실패 ${fail}`);
  await redis.quit();
  await db.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

run().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
