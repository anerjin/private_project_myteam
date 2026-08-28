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
const COOKIE = process.env.SESSION_COOKIE_NAME || "qb_session";
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
  status: "PENDING" | "ACTIVE" | "REJECTED" | "SUSPENDED" | "WITHDRAWN",
  role: "MEMBER" | "ADMIN" = "MEMBER",
  statusReason?: string
) {
  const u = await db.user.create({
    data: {
      username: `vp3_${tag}_${randomBytes(4).toString("hex")}`,
      passwordHash: hash,
      name: `검증-${tag}`,
      department: "검증팀",
      status,
      role,
      statusReason,
      signupReason: "P3 검증용 계정입니다",
    },
    select: { id: true, username: true, name: true, role: true },
  });
  made.push(u.id);
  return u;
}

function actorOf(u: { id: string; username: string; role: string }): Actor {
  return {
    id: u.id,
    username: u.username,
    role: u.role as Actor["role"],
    via: "WEB",
  };
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
   * `승인 대기 {n}건` 은 HTML 에서 `승인 대기 <!-- -->2<!-- -->건` 입니다.
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

  console.log("\n① 거부 → 그 계정으로 로그인 → 사유가 보이는가");
  {
    const applicant = await makeUser("reject", "PENDING");
    const reason =
      "제출하신 소속이 확인되지 않습니다. 팀장 확인 후 다시 신청해 주세요.";
    await memberService.transition(adminActor, applicant.id, {
      kind: "REJECT",
      reason,
    });
    const msg = await messageOf(() =>
      authService.signIn(applicant.username, PASSWORD, undefined, {})
    );
    check("거부 사유가 로그인 응답에 실린다", msg.includes(reason), msg);

    // 알림 행을 만들지 않는다 (DEC-041) — 읽을 수 없는 곳에 쓰지 않는다
    const n = await db.notification.count({ where: { userId: applicant.id } });
    check("거부는 알림 행을 만들지 않는다", n === 0, `알림 ${n}건`);
  }

  console.log("\n①' 탈퇴 계정이 존재를 노출하지 않는가 (NFR-SEC-016)");
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

  console.log("\n② 승인 → 즉시 대시보드 진입 (15분 대기 없음)");
  {
    const applicant = await makeUser("approve", "PENDING");
    const before = await cookieFor(applicant.id);

    // 승인 «전» 화면을 한 번 봐서 PENDING 스냅샷을 캐시에 깐다
    const pendingPage = await get("/pending", before);
    check("승인 전 /pending 이 보인다", pendingPage.status === 200);
    const blocked = await get("/dashboard", before);
    check(
      "승인 전 /dashboard 는 /pending 으로 보낸다",
      blocked.status === 307 && blocked.location?.includes("/pending") === true,
      `${blocked.status} ${blocked.location ?? ""}`
    );

    const r = await memberService.transition(adminActor, applicant.id, {
      kind: "APPROVE",
    });
    check("승인이 캐시를 무효화했다", r.sessions.cacheInvalidated);

    // 승인은 세션을 끊는다 → 옛 쿠키는 즉시 죽어야 한다
    const dead = await get("/dashboard", before);
    check(
      "옛 세션은 즉시 죽는다",
      dead.status === 307 && dead.location?.includes("/login") === true,
      `${dead.status} ${dead.location ?? ""}`
    );

    // 다시 로그인하면 곧바로 들어가야 한다 (옛 코드에서는 최대 15분 /pending)
    const after = await cookieFor(applicant.id);
    const dash = await get("/dashboard", after);
    check(
      "재로그인하면 대시보드가 열린다",
      dash.status === 200,
      `${dash.status}`
    );
  }

  console.log(
    "\n③ 일괄 승인에 처리 불가 회원을 섞으면 실패 목록에 이름이 나오는가"
  );
  {
    const ok1 = await makeUser("bulk-ok1", "PENDING");
    const ok2 = await makeUser("bulk-ok2", "PENDING");
    const bad = await makeUser("bulk-bad", "SUSPENDED");
    const res = await memberService.transitionMany(
      adminActor,
      [ok1.id, ok2.id, bad.id],
      { kind: "APPROVE" }
    );
    check(
      "성공 2 · 실패 1",
      res.succeeded.length === 2 && res.failed.length === 1
    );
    check(
      "실패 항목에 아이디가 실린다",
      res.failed[0]?.username === bad.username,
      res.failed[0]?.username ?? "(없음)"
    );
    check(
      "성공 항목에 세션 결과가 실린다",
      res.succeeded.every(
        (s) => typeof s.sessions?.cacheInvalidated === "boolean"
      )
    );

    // batchId 가 감사 로그에 남았는가 (DEC-039)
    const logs = await db.auditLog.findMany({
      where: { targetId: { in: [ok1.id, ok2.id] }, action: "USER_APPROVE" },
      select: { diff: true },
    });
    const ids = new Set(
      logs.map((l) => (l.diff as { batchId?: string } | null)?.batchId)
    );
    check(
      "감사 로그 2건이 같은 batchId 로 묶인다",
      logs.length === 2 && ids.size === 1 && [...ids][0] !== undefined,
      [...ids].join(",")
    );
  }

  console.log("\n④ 목록 → 상세가 404 가 아닌가");
  {
    const target = await makeUser("detail", "PENDING");
    const list = await get("/admin/members", adminCookie);
    check("회원 목록이 열린다", list.status === 200, `${list.status}`);
    check(
      "목록에 실제 회원 링크가 있다",
      list.body.includes(`/admin/members/${target.id}`)
    );
    const detail = await get(`/admin/members/${target.id}`, adminCookie);
    check("상세가 열린다", detail.status === 200, `${detail.status}`);
    check("상세에 이름이 보인다", detail.body.includes(target.name));
    check(
      "상세에 가입 사유가 보인다",
      detail.body.includes("P3 검증용 계정입니다")
    );
  }

  console.log("\n⑤ 거부 취소 → PENDING 복귀");
  {
    const u = await makeUser("reopen", "PENDING");
    await memberService.transition(adminActor, u.id, {
      kind: "REJECT",
      reason: "중복 신청으로 보여 일단 거부합니다. 확인 후 재검토하겠습니다.",
    });
    await memberService.transition(adminActor, u.id, { kind: "REOPEN" });
    const after = await db.user.findUnique({
      where: { id: u.id },
      select: { status: true, statusReason: true },
    });
    check(
      "상태가 PENDING 으로 돌아온다",
      after?.status === "PENDING",
      after?.status
    );
    check(
      "옛 거부 사유가 지워진다",
      after?.statusReason === null,
      after?.statusReason ?? "null"
    );
  }

  console.log("\n⑥ 같은 값으로 가는 전이는 거부되는가");
  {
    const u = await makeUser("noop", "ACTIVE");
    const msg = await messageOf(() =>
      memberService.transition(adminActor, u.id, {
        kind: "CHANGE_ROLE",
        role: "MEMBER",
      })
    );
    check("같은 역할로 변경은 거부된다", msg === "이미 그 상태입니다.", msg);
    const sessions = await db.session.count({ where: { userId: u.id } });
    check("거부됐으므로 세션도 안 끊긴다", sessions === 0, `${sessions}`);
  }

  console.log("\n⑦ 비밀번호 초기화 — 자기 자신·차단 계정");
  {
    const self = await messageOf(() =>
      memberService.resetPassword(adminActor, admin.id, "x", hashPassword)
    );
    check("자기 자신에게는 못 건다", self.includes("마이페이지"), self);

    const gone = await makeUser("reset-gone", "REJECTED");
    const blocked = await messageOf(() =>
      memberService.resetPassword(adminActor, gone.id, "x", hashPassword)
    );
    check(
      "거부된 계정에는 못 건다",
      blocked.includes("초기화할 수 없는 상태"),
      blocked
    );
  }

  console.log("\n⑧ 감사 로그가 롤백과 운명을 같이하는가 (DEC-043)");
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

  console.log("\n⑨ 배지가 실데이터인가 (DEC-038)");
  {
    const dbCount = await db.user.count({ where: { status: "PENDING" } });
    const svc = await memberService.countPending();
    check(
      "countPending 이 DB 와 같다",
      svc === dbCount,
      `${svc} vs ${dbCount}`
    );
    const page = await get("/admin", adminCookie);
    check("관리자 대시보드가 열린다", page.status === 200, `${page.status}`);
    check(
      `대시보드가 승인 대기 ${dbCount}건을 보여준다`,
      page.body.includes(`승인 대기 ${dbCount}건`)
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
