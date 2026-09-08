/**
 * API 키 검증 — `DEC-037`·`NFR-SEC-017` 의 **「확인하는 법」**.
 *
 *   npx tsx --conditions=react-server --env-file=.env scripts/verify-p3-keys.ts
 *
 * `DEV-07 · 7.3` M1 DoD 의 **「정지하면 API 키도 무효화된다」를 시연하는 유일한 물건**입니다.
 * 지우면 그 DoD 와 `DEC-037`·`NFR-SEC-017` 이 다시 «관측 불가» 상태로 돌아갑니다.
 *
 * 나머지는 리뷰가 «재현한» 결함을 그대로 다시 던져 막힌 것을 봅니다 —
 * 고쳤다고 말하려면 뚫렸던 것과 같은 방법으로 막힌 것을 보여야 합니다.
 */
import { randomBytes } from "node:crypto";

import { MAX_KEYS_PER_USER } from "@/features/members/api-key.schema";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { redis } from "@/lib/redis";
import type { Actor } from "@/server/auth/actor";
import { assertScope, verifyKey } from "@/server/auth/api-key";
import { hashPassword } from "@/server/auth/password";
import {
  destroyById,
  issue as issueSession,
  listFor,
} from "@/server/auth/session";
import * as apiKeyService from "@/server/services/api-key.service";
import * as memberService from "@/server/services/member.service";

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

async function mkUser(tag: string) {
  const u = await db.user.create({
    data: {
      username: `vak_${tag}_${randomBytes(4).toString("hex")}`,
      passwordHash: hash,
      name: `키검증-${tag}`,
      status: "ACTIVE",
    },
    select: { id: true, username: true },
  });
  made.push(u.id);
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

async function run() {
  hash = await hashPassword("Verify!12345");

  console.log(
    "\n★ M1 DoD — 정지하면 API 키도 무효화된다 (DEC-037: 폐기가 아니라 판정)"
  );
  {
    const u = await mkUser("dod");
    const key = await apiKeyService.issue(actorOf(u), "DoD 키", [
      "resources:read",
      "archive:run",
    ]);

    const before = await verifyKey(key.plaintext);
    check(
      "ACTIVE 일 때 키가 통한다",
      before.actor.id === u.id && before.actor.via === "MCP",
      `via=${before.actor.via} scopes=${before.scopes.join(",")}`
    );
    check(
      "발급할 때 고른 스코프가 그대로 온다",
      before.scopes.includes("archive:run"),
      before.scopes.join(",")
    );

    // 다른 계정이 정지시킨다 — 키를 «건드리지 않는다»
    const admin = await mkUser("dod-admin");
    await mkUser("dod-admin2"); // 마지막 «활성 계정» 보호 회피
    await memberService.transition(actorOf(admin), u.id, {
      kind: "SUSPEND",
      reason: "M1 DoD 검증을 위한 정지입니다.",
    });

    const after = await msg(() => verifyKey(key.plaintext));
    check("정지 즉시 키가 막힌다", after.includes("사용할 수 없습니다"), after);

    const row = await db.apiKey.findUnique({
      where: { id: key.id },
      select: { revokedAt: true },
    });
    check(
      "그런데 키는 «폐기되지 않았다» (DEC-037)",
      row?.revokedAt === null,
      `revokedAt=${row?.revokedAt}`
    );

    // 정지 해제하면 되살아나야 한다 — 폐기했다면 불가능한 일이다
    await memberService.transition(actorOf(admin), u.id, {
      kind: "REACTIVATE",
    });
    const revived = await verifyKey(key.plaintext);
    check(
      "정지 해제하면 같은 키가 다시 통한다",
      revived.actor.id === u.id,
      `scopes=${revived.scopes.join(",")}`
    );
  }

  console.log(
    "\n★ 스코프가 남은 유일한 권한 구분이다 (DEC-037 · DEC-077 · NFR-SEC-017)"
  );
  {
    /*
     * 🔄 이 자리는 **「키는 발급자의 역할을 넘지 못한다」**였습니다 —
     *    `MEMBER` 가 `archive:run` 키를 못 만들고, 발급 후 강등되면 그 스코프가
     *    «빠지는» 것을 봤습니다. `DEC-077` 로 사람의 등급이 사라져 그 두 시나리오는
     *    **재현할 수 없습니다.**
     *
     *    `NFR-SEC-017` 이 지키려던 것(「키가 그 주인이 못 하는 일을 하게 되지
     *    않는다」)은 주인들 사이에 등급 차가 없어져 자동으로 성립합니다.
     *    남은 것은 두 가지이고, 아래가 그 둘을 봅니다:
     *
     *    ① 목록에 없는 스코프로는 키를 못 만든다 (`issue`)
     *    ② DB 에 남아 있는 «없어진» 스코프는 권한이 되지 않는다 (`effectiveScopes`)
     *
     *    ②가 이 파일에서 가장 중요한 줄입니다 — 스코프를 하나 없애는 날,
     *    옛 키가 그것을 계속 행사하면 안 됩니다.
     */
    const u = await mkUser("scope");
    const denied = await msg(() =>
      apiKeyService.issue(actorOf(u), "없는 스코프", ["repos:delete"])
    );
    check(
      "① 목록에 없는 스코프는 발급되지 않는다",
      denied.includes("없는 스코프"),
      denied
    );

    const key = await apiKeyService.issue(actorOf(u), "스코프 필터 확인", [
      "resources:read",
      "archive:run",
    ]);
    const full = await verifyKey(key.plaintext);
    check(
      "고른 스코프 둘이 다 온다",
      full.scopes.includes("resources:read") &&
        full.scopes.includes("archive:run"),
      full.scopes.join(",")
    );

    /*
     * **DB 에 직접 씁니다.** service 를 지나면 ①이 막으므로, 「스코프를 없앤
     * 뒤 남은 옛 키」를 재현하는 길은 이것뿐입니다.
     */
    await db.apiKey.update({
      where: { id: key.id },
      data: { scopes: ["resources:read", "archive:run", "gone:scope"] },
    });
    const filtered = await verifyKey(key.plaintext);
    check(
      "② 목록에 없는 스코프는 걸러진다",
      !(filtered.scopes as string[]).includes("gone:scope"),
      filtered.scopes.join(",")
    );
    check(
      "남은 스코프는 그대로 쓸 수 있다",
      filtered.scopes.includes("resources:read") &&
        filtered.scopes.includes("archive:run")
    );

    const scoped = await msg(async () =>
      assertScope(
        {
          ...filtered,
          scopes: filtered.scopes.filter((x) => x !== "archive:run"),
        },
        "archive:run"
      )
    );
    check(
      "assertScope 가 없는 스코프를 막는다",
      scoped.includes("권한이 없습니다"),
      scoped
    );
  }

  console.log("\n★ 폐기·만료 키는 통하지 않는다 (DEV-02 · 2.7 세 조건)");
  {
    const u = await mkUser("threecond");
    const a = actorOf(u);

    const revoked = await apiKeyService.issue(a, "폐기할 키", [
      "resources:read",
    ]);
    await apiKeyService.revoke(a, revoked.id);
    const m1 = await msg(() => verifyKey(revoked.plaintext));
    check("폐기된 키", m1.includes("폐기된"), m1);

    const expiring = await apiKeyService.issue(a, "만료시킬 키", [
      "resources:read",
    ]);
    await db.apiKey.update({
      where: { id: expiring.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const m2 = await msg(() => verifyKey(expiring.plaintext));
    check("만료된 키", m2.includes("만료된"), m2);

    const m3 = await msg(() => verifyKey("nw_live_존재하지않는키"));
    check("없는 키", m3.includes("유효하지 않은"), m3);
  }

  console.log("\nH2 발급 상한 경합 — 리뷰 재현: 동시 8건 → 8개 생성");
  {
    const u = await mkUser("race");
    const a = actorOf(u);
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        apiKeyService.issue(a, `key-${i}`, ["resources:read"])
      )
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const alive = await db.apiKey.count({
      where: { userId: u.id, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    check(
      `동시 8건 중 ${MAX_KEYS_PER_USER}건만 통과`,
      alive <= MAX_KEYS_PER_USER,
      `성공 ${ok} · 살아있는 키 ${alive} (상한 ${MAX_KEYS_PER_USER})`
    );
  }

  console.log("\nH4 revokeAllKeysFor — 인가가 사라진 자리 (DEC-077)");
  {
    const victim = await mkUser("victim");
    const stranger = await mkUser("stranger");
    await apiKeyService.issue(actorOf(victim), "피해자 키", ["resources:read"]);

    /*
     * 🔄 리뷰가 재현했던 결함은 **「`MEMBER` 가 남의 키를 폐기할 수 있다」**였고
     *    그것을 막는 검사(「`ADMIN` 이거나 본인」)가 여기 있었습니다.
     *    `DEC-077` 로 사람이 전부 관리자가 되면서 그 검사가 언제나 통과가 되어
     *    지워졌습니다 — `FR-ADM-016`(강제 폐기)이 로그인한 사람 전부에게 열립니다.
     *
     *    **그래서 이 검증이 보는 것이 바뀝니다.** 막히는지가 아니라
     *    **기록이 남는지**를 봅니다: 인가가 없어진 만큼 「누가 남의 키를
     *    지웠나」의 답은 이제 감사 로그에만 있습니다.
     */
    const n = await apiKeyService.revokeAllKeysFor(
      actorOf(stranger),
      victim.id
    );
    check("남의 키도 폐기된다 (DEC-077)", n === 1, `${n}개`);

    const log = await db.auditLog.findFirst({
      where: { targetId: victim.id, action: "APIKEY_REVOKE" },
      orderBy: { createdAt: "desc" },
      select: { actorId: true, diff: true },
    });
    check(
      "누가 지웠는지가 감사 로그에 남는다",
      log?.actorId === stranger.id,
      String(log?.actorId)
    );
    const revoked = (log?.diff as { revoked?: { name: string }[] } | null)
      ?.revoked;
    check(
      "감사 로그에 폐기된 키 이름이 남는다",
      Array.isArray(revoked) && revoked[0]?.name === "피해자 키",
      JSON.stringify(revoked)
    );

    // 본인 경로도 그대로다 (P8 탈퇴가 쓴다)
    await apiKeyService.issue(actorOf(victim), "본인 폐기용", [
      "resources:read",
    ]);
    const self = await apiKeyService.revokeAllKeysFor(
      actorOf(victim),
      victim.id
    );
    check("본인은 자기 키를 전량 폐기할 수 있다", self === 1, `${self}개`);
  }

  console.log("\nM1 동시 폐기 이중 기록 — 리뷰 재현: 성공 2 · 로그 2건");
  {
    const u = await mkUser("double");
    const a = actorOf(u);
    const key = await apiKeyService.issue(a, "중복 폐기 대상", [
      "resources:read",
    ]);
    const r = await Promise.allSettled([
      apiKeyService.revoke(a, key.id),
      apiKeyService.revoke(a, key.id),
    ]);
    const ok = r.filter((x) => x.status === "fulfilled").length;
    const logs = await db.auditLog.count({
      where: { targetId: key.id, action: "APIKEY_REVOKE" },
    });
    check("동시 폐기 2건 중 1건만 통과", ok === 1, `성공 ${ok}`);
    check("감사 로그도 1건", logs === 1, `${logs}건`);
  }

  console.log("\nM2 만료된 키가 상한을 잡아먹지 않는가");
  {
    const u = await mkUser("expired");
    await db.apiKey.createMany({
      data: Array.from({ length: MAX_KEYS_PER_USER }, (_, i) => ({
        userId: u.id,
        name: `옛 키 ${i}`,
        keyPrefix: `nw_live_x${i}`,
        keyHash: `hash-${randomBytes(8).toString("hex")}`,
        scopes: ["resources:read"],
        expiresAt: new Date(Date.now() - 86_400_000),
      })),
    });
    const m = await msg(() =>
      apiKeyService.issue(actorOf(u), "새 키", ["resources:read"])
    );
    check("만료 키 5개가 있어도 발급된다", m === "(오류 없음)", m);
  }

  console.log("\nM1 감사 로그가 트랜잭션과 운명을 같이하는가 (DEC-043)");
  {
    const u = await mkUser("audit");
    const a = actorOf(u);
    const before = await db.auditLog.count({ where: { actorId: u.id } });
    await apiKeyService.issue(a, "감사 확인", ["resources:read"]);
    const after = await db.auditLog.count({ where: { actorId: u.id } });
    check(
      "발급이 감사 로그를 남긴다",
      after === before + 1,
      `${before}→${after}`
    );

    const bad = await msg(() =>
      apiKeyService.issue(a, "없는 스코프", ["nope:nope"])
    );
    const after2 = await db.auditLog.count({ where: { actorId: u.id } });
    check("실패는 감사 로그를 남기지 않는다", after2 === after, bad);
  }

  console.log("\nM11 감사 로그에 userAgent 가 실리는가 (REQ-02 · 2.10)");
  {
    const u = await mkUser("ua");
    // 액션 경로가 아니므로 Actor 를 직접 만들어 확인한다 —
    // 화면 경로는 `toActor` 가 채우고, 그건 verify-p3.ts 가 HTTP 로 본다.
    const a: Actor = { ...actorOf(u), userAgent: "verify-p3-keys" };
    await apiKeyService.issue(a, "UA 확인", ["resources:read"]);
    const log = await db.auditLog.findFirst({
      where: { actorId: u.id, action: "APIKEY_CREATE" },
      select: { userAgent: true, ip: true },
    });
    check(
      "userAgent 가 남는다",
      log?.userAgent === "verify-p3-keys",
      log?.userAgent ?? "null"
    );
    check(
      "ip 는 1단계에서 null 이다 (TRUST_PROXY 꺼짐 — NFR-SEC-002)",
      log?.ip === null,
      String(log?.ip)
    );
  }

  console.log("\nL1 스코프 중복이 저장되지 않는가");
  {
    const u = await mkUser("dup");
    const k = await apiKeyService.issue(actorOf(u), "중복 스코프", [
      "resources:read",
      "resources:read",
      "resources:read",
    ]);
    const row = await db.apiKey.findUnique({
      where: { id: k.id },
      select: { scopes: true },
    });
    check(
      "중복이 제거된다",
      row?.scopes.length === 1,
      JSON.stringify(row?.scopes)
    );
  }

  console.log("\nH3 활성 세션 목록이 죽은 세션을 거르는가");
  {
    const u = await mkUser("sess");
    await issueSession(u.id, { userAgent: "live" });
    await db.session.create({
      data: {
        tokenHash: `expired-${randomBytes(8).toString("hex")}`,
        userId: u.id,
        expires: new Date(Date.now() - 1000),
        lastSeenAt: new Date(),
      },
    });
    await db.session.create({
      data: {
        tokenHash: `idle-${randomBytes(8).toString("hex")}`,
        userId: u.id,
        expires: new Date(Date.now() + 86_400_000),
        lastSeenAt: new Date(Date.now() - 30 * 3600 * 1000),
      },
    });

    const rows = await listFor(u.id);
    check("살아있는 세션 1건만 나온다", rows.length === 1, `${rows.length}건`);

    const other = await mkUser("sess-other");
    const target = await db.session.findFirst({ where: { userId: u.id } });
    check(
      "남의 세션 종료는 false 를 돌려준다",
      (await destroyById(target!.id, other.id)) === false
    );
    check(
      "본인 세션 종료는 true 를 돌려준다",
      (await destroyById(target!.id, u.id)) === true
    );
  }

  // ── 정리 ────────────────────────────────────────────
  await db.auditLog.deleteMany({ where: { actorId: { in: made } } });
  await db.auditLog.deleteMany({ where: { targetId: { in: made } } });
  await db.apiKey.deleteMany({ where: { userId: { in: made } } });
  await db.session.deleteMany({ where: { userId: { in: made } } });
  await db.user.deleteMany({ where: { id: { in: made } } });
  if (made.length) await redis.del(...made.map((id) => `user:gen:${id}`));

  console.log(`\n합계: 통과 ${pass} · 실패 ${fail}`);
  await redis.quit();
  await db.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

run().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
