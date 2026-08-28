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

async function mkUser(
  tag: string,
  role: "MEMBER" | "EDITOR" | "ADMIN" = "MEMBER"
) {
  const u = await db.user.create({
    data: {
      username: `vak_${tag}_${randomBytes(4).toString("hex")}`,
      passwordHash: hash,
      name: `키검증-${tag}`,
      status: "ACTIVE",
      role,
    },
    select: { id: true, username: true, role: true },
  });
  made.push(u.id);
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

async function run() {
  hash = await hashPassword("Verify!12345");

  console.log(
    "\n★ M1 DoD — 정지하면 API 키도 무효화된다 (DEC-037: 폐기가 아니라 판정)"
  );
  {
    const u = await mkUser("dod", "EDITOR");
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
      "EDITOR 는 archive:run 을 갖는다",
      before.scopes.includes("archive:run")
    );

    // 관리자가 정지시킨다 — 키를 «건드리지 않는다»
    const admin = await mkUser("dod-admin", "ADMIN");
    await mkUser("dod-admin2", "ADMIN"); // 마지막 관리자 보호 회피
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

  console.log("\n★ NFR-SEC-017 — 키는 발급자의 역할을 넘지 못한다");
  {
    const member = await mkUser("scope-member", "MEMBER");
    const denied = await msg(() =>
      apiKeyService.issue(actorOf(member), "권한 초과 시도", ["archive:run"])
    );
    check(
      "MEMBER 는 archive:run 키를 못 만든다",
      denied.includes("선택할 수 없는 스코프"),
      denied
    );

    // 발급 후 강등되면 «지금» 역할로 좁혀진다 (키는 그대로)
    const editor = await mkUser("scope-editor", "EDITOR");
    const admin = await mkUser("scope-admin", "ADMIN");
    await mkUser("scope-admin2", "ADMIN");
    const key = await apiKeyService.issue(actorOf(editor), "강등 전 키", [
      "resources:read",
      "archive:run",
    ]);
    check(
      "EDITOR 로 발급하면 archive:run 이 있다",
      (await verifyKey(key.plaintext)).scopes.includes("archive:run")
    );

    await memberService.transition(actorOf(admin), editor.id, {
      kind: "CHANGE_ROLE",
      role: "MEMBER",
    });
    const narrowed = await verifyKey(key.plaintext);
    check(
      "MEMBER 로 강등되면 archive:run 이 «빠진다»",
      !narrowed.scopes.includes("archive:run"),
      `scopes=${narrowed.scopes.join(",")}`
    );
    check(
      "남은 스코프는 그대로 쓸 수 있다",
      narrowed.scopes.includes("resources:read")
    );

    const scoped = await msg(async () => assertScope(narrowed, "archive:run"));
    check("assertScope 가 막는다", scoped.includes("권한이 없습니다"), scoped);
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

    const m3 = await msg(() => verifyKey("qb_live_존재하지않는키"));
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

  console.log(
    "\nH4 revokeAllKeysFor 인가 — 리뷰 재현: MEMBER 가 남의 키 폐기 성공"
  );
  {
    const victim = await mkUser("victim");
    const stranger = await mkUser("stranger");
    await apiKeyService.issue(actorOf(victim), "피해자 키", ["resources:read"]);

    const m = await msg(() =>
      apiKeyService.revokeAllKeysFor(actorOf(stranger), victim.id)
    );
    check("남의 MEMBER 는 막힌다", m.includes("권한이 없습니다"), m);

    const survived = await db.apiKey.count({
      where: { userId: victim.id, revokedAt: null },
    });
    check("피해자 키가 살아 있다", survived === 1, `${survived}개`);

    // 본인은 된다 (P8 탈퇴가 쓸 경로)
    const self = await apiKeyService.revokeAllKeysFor(
      actorOf(victim),
      victim.id
    );
    check("본인은 자기 키를 전량 폐기할 수 있다", self === 1, `${self}개`);

    const log = await db.auditLog.findFirst({
      where: { targetId: victim.id, action: "APIKEY_REVOKE" },
      select: { diff: true },
    });
    const revoked = (log?.diff as { revoked?: { name: string }[] } | null)
      ?.revoked;
    check(
      "감사 로그에 폐기된 키 이름이 남는다",
      Array.isArray(revoked) && revoked[0]?.name === "피해자 키",
      JSON.stringify(revoked)
    );
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
        keyPrefix: `qb_live_x${i}`,
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
