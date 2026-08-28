import "server-only";

import { randomUUID } from "node:crypto";

import type { Prisma, Role, UserStatus } from "@prisma/client";

import { isResettableStatus, TRANSITION_FROM } from "@/features/members/schema";
import { db } from "@/lib/db";
import { AppError, type ErrorCode } from "@/lib/errors";
import type { Actor } from "@/server/auth/actor";
import {
  deleteSessionsFor,
  invalidateSessionCache,
} from "@/server/auth/session";
import * as memberRepo from "@/server/repositories/member.repository";
import * as audit from "@/server/services/audit.service";
import * as notify from "@/server/services/notification.service";

/**
 * 회원 상태·역할 전이 (DEC-036).
 *
 * ## `users.status` 와 `users.role` 의 **전이**는 이 파일 하나를 지납니다
 *
 * 상태 변경과 세션 무효화를 **같은 경계 안에 묶기** 위해서입니다.
 * 「무효화를 부르는 것을 잊는다」는 사람이 기억할 규칙이라 반드시 빠집니다.
 * 한 함수로 묶으면 그 실수가 **「`users` 를 다른 데서 쓴다」로 바뀌고,
 * 그건 `scripts/check-deps.mjs` 가 잡습니다.**
 *
 * > 전에 이 자리에는 *"쓰는 곳은 이 파일 하나뿐입니다"* 라고 적혀 있었는데
 * > **이미 거짓이었습니다** — `user.repository.create` 가 가입 시 `status`·`role` 을
 * > 씁니다. 그리고 그것을 잡는다던 검사기는 인자를 보느라 **아무것도 보고 있지
 * > 않았습니다** (`DEC-044`). 허용되는 문은 셋이고 목록은 `check-deps.mjs` 에 있습니다.
 *
 * ## 마지막 관리자 보호 (`FR-ADM-009`)
 *
 * 판정과 반영이 갈라지면 **관리자 2명이 동시에 서로를 강등해 0명**이 됩니다.
 * 그 상태는 시드 스크립트로만 복구됩니다 (`REQ-02 · 2.2`).
 * 그래서 트랜잭션을 열고 **advisory 락**을 잡은 뒤 **트랜잭션 안에서** 다시 셉니다.
 *
 * `SERIALIZABLE` 대신 락을 쓰는 이유: 직렬화 실패(40001) 재시도 루프를 모든 관리자
 * 액션에 넣어야 하고, 빠뜨리면 관리자에게 `INTERNAL_ERROR` 가 뜹니다 —
 * **락 한 줄보다 많은 코드로 더 나쁜 결과**를 사는 셈입니다.
 * 동시 20명 규모에서 단일 락의 직렬화 비용은 논의 대상이 아닙니다.
 */

/**
 * 임의 상수. 회원 상태 전이는 전부 이 하나를 탄다 — 예외를 두면 예외가 규칙이 된다.
 *
 * `tsconfig` 의 `target` 이 ES2017 이라 BigInt 리터럴(`123n`)을 쓸 수 없어
 * `BigInt()` 로 만든다. `pg_advisory_xact_lock` 은 bigint 를 받는다.
 */
const MEMBER_STATE_LOCK = BigInt(51420001);

export type Transition =
  | { kind: "APPROVE" }
  | { kind: "REJECT"; reason: string }
  | { kind: "REOPEN" }
  | { kind: "SUSPEND"; reason: string }
  | { kind: "REACTIVATE" }
  | { kind: "CHANGE_ROLE"; role: Role };

interface TransitionSpec {
  /** 이 전이가 허용되는 «현재» 상태 */
  from: readonly UserStatus[];
  next?: UserStatus;
  action: audit.AuditAction;
  label: string;
  /** 처리 결과를 신청자의 알림함에 남긴다 (`FR-NOTI-002`) */
  notifyUser?: (name: string) => { title: string; body?: string };
}

const SPECS: Record<Transition["kind"], TransitionSpec> = {
  APPROVE: {
    from: TRANSITION_FROM.APPROVE,
    next: "ACTIVE",
    action: "USER_APPROVE",
    label: "승인",
    notifyUser: () => ({
      title: "가입이 승인되었습니다",
      body: "이제 QueenBee 를 이용할 수 있습니다.",
    }),
  },
  /**
   * 거부를 되돌려 재검토 대기로 (`DEC-042`, `REQ-02 · 2.4`).
   *
   * **없으면 「거부」가 되돌릴 수 없는 종착역**입니다. 오타 한 번으로 신청이
   * 영구 폐기되고, 아이디는 `DEC-021`(점유)로 영원히 잠기며, 그 사람은 아이디를
   * 바꿔 다시 신청해야 합니다 — **관리자의 실수를 사용자가 갚습니다.**
   */
  REOPEN: {
    from: TRANSITION_FROM.REOPEN,
    next: "PENDING",
    action: "USER_REOPEN",
    label: "재검토",
  },
  REJECT: {
    from: TRANSITION_FROM.REJECT,
    next: "REJECTED",
    action: "USER_REJECT",
    label: "거부",
    /*
     * **알림을 만들지 않습니다** (`DEC-041`).
     * 거부된 사람은 로그인이 막혀(`DEC-040`) 알림함에 **영원히 도달할 수 없습니다.**
     * 사유는 `auth.service` 가 **로그인 화면에서** 전달합니다 — 그 사람이 닿을 수
     * 있는 유일한 지점이고, `FR-AUTH-007` 이 이미 그렇게 정해 두었습니다.
     */
  },
  SUSPEND: {
    from: TRANSITION_FROM.SUSPEND,
    next: "SUSPENDED",
    action: "USER_SUSPEND",
    label: "정지",
    /*
     * 거부와 같은 이유로 알림을 만들지 않습니다 (`DEC-041`).
     * **정지 사유는 본인에게 전달하지 않습니다** — `FR-AUTH-007` 은 `SUSPENDED` 에
     * 「문의 안내」만 요구합니다. 정지는 조사 중일 수 있고, 사유 원문이 본인에게
     * 가면 안 되는 경우가 있습니다. 사유는 감사 로그와 관리자 화면에만 남습니다.
     */
  },
  REACTIVATE: {
    from: TRANSITION_FROM.REACTIVATE,
    next: "ACTIVE",
    action: "USER_REACTIVATE",
    label: "정지 해제",
    notifyUser: () => ({ title: "계정 정지가 해제되었습니다" }),
  },
  CHANGE_ROLE: {
    from: TRANSITION_FROM.CHANGE_ROLE,
    action: "USER_ROLE_CHANGE",
    label: "역할 변경",
  },
};

export interface TransitionResult {
  id: string;
  username: string;
  /** 세션 무효화 결과 — 실패해도 본 작업은 유효하다 (DEC-036) */
  sessions: { deleted: number; cacheInvalidated: boolean };
}

/**
 * **모든 전이가 세션을 끊습니다.** 조건 분기를 두지 않는 이유:
 *
 * 승인(`PENDING → ACTIVE`)조차 끊어야 합니다. 승인 대기 중에 발급된 세션이 살아 있으면
 * 캐시에 `status: PENDING` 스냅샷이 남아 승인 직후에도 `/pending` 으로 튕깁니다.
 * 「어떤 전이는 끊고 어떤 전이는 안 끊는다」는 표를 만드는 순간 그 표가 **두 번째 규칙**이
 * 되고, 새 전이를 추가한 사람이 표를 빠뜨립니다 (`DEC-036`).
 */

/** 이 전이가 «활성 관리자» 집합에서 대상을 빼는가 — 일반식으로 판정한다 */
function removesActiveAdmin(
  current: { role: Role; status: UserStatus },
  spec: TransitionSpec,
  t: Transition
): boolean {
  const isActiveAdmin = current.role === "ADMIN" && current.status === "ACTIVE";
  if (!isActiveAdmin) return false;

  // 상태가 ACTIVE 밖으로 나가거나, 역할이 ADMIN 이 아닌 것으로 바뀌면 빠진다
  if (spec.next && spec.next !== "ACTIVE") return true;
  if (t.kind === "CHANGE_ROLE" && t.role !== "ADMIN") return true;
  return false;
}

/**
 * 승인 대기 건수 — 사이드바 배지·대시보드용 (`FR-NOTI-001`).
 *
 * **`notifications` 를 세지 않고 `users where status = PENDING` 을 셉니다**
 * (`DEC-038`). 알림 행을 세면 관리자가 읽음 처리한 순간 배지가 사라지는데,
 * **대기 건수는 「지금의 사실」이지 「읽었는가」가 아닙니다.**
 * 관리자가 셋이면 셋 다 같은 숫자를 봐야 합니다.
 */
export async function countPending(): Promise<number> {
  const rows = await memberRepo.countByStatus();
  return rows.find((r) => r.status === "PENDING")?._count ?? 0;
}

/** 전체 회원 수 — 탈퇴자는 뺀다. 「지금 쓸 수 있는 계정」이 궁금한 숫자다 */
/** 빵부스러기 라벨용 이름 한 개 — `resource.service.titleBySlug` 와 같은 자리·같은 이유 */
export async function nameById(id: string): Promise<string | null> {
  const u = await db.user.findUnique({ where: { id }, select: { name: true } });
  return u?.name ?? null;
}

export async function countAll(): Promise<number> {
  const rows = await memberRepo.countByStatus();
  return rows
    .filter((r) => r.status !== "WITHDRAWN")
    .reduce((sum, r) => sum + r._count, 0);
}

export async function transition(
  actor: Actor,
  targetId: string,
  t: Transition,
  /** 일괄 처리의 묶음 식별자 (`DEC-039`) — 감사 로그에서 50건을 다시 묶어 준다 */
  batchId?: string
): Promise<TransitionResult> {
  const spec = SPECS[t.kind];

  const { username, sessionsDeleted } = await db.$transaction(async (tx) => {
    // **첫 줄.** 관리자 수를 늘리는 전이(승인)도 같은 락을 탄다.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${MEMBER_STATE_LOCK})`;

    const target = await tx.user.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        status: true,
      },
    });
    if (!target) throw new AppError("NOT_FOUND", "회원을 찾을 수 없습니다.");

    if (!spec.from.includes(target.status)) {
      throw new AppError(
        "INVALID_STATE",
        `${spec.label}할 수 없는 상태입니다 (현재: ${target.status}).`
      );
    }

    const before = { status: target.status, role: target.role };
    const after = {
      status: spec.next ?? target.status,
      role: t.kind === "CHANGE_ROLE" ? t.role : target.role,
    };

    /*
     * **아무것도 바꾸지 않는 전이는 거부합니다** (`DEC-042`).
     *
     * 같은 역할로 「변경」하면 아래에서 **세션이 전부 끊기고** `before === after` 인
     * 감사 로그가 한 줄 남습니다 — 아무 일도 안 한 동작이 사용자를 로그아웃시킵니다.
     * 드롭다운이 현재 역할을 걸러 주지만 **화면의 필터는 인가가 아니고**,
     * 두 관리자가 동시에 같은 역할로 바꾸면 두 번째가 이 경우가 됩니다.
     */
    if (before.status === after.status && before.role === after.role) {
      throw new AppError("INVALID_STATE", "이미 그 상태입니다.");
    }

    // 마지막 관리자 보호 — **트랜잭션 안에서 다시 센다** (FR-ADM-009)
    if (removesActiveAdmin(target, spec, t)) {
      const admins = await memberRepo.countActiveAdmins(tx);
      if (admins <= 1) {
        throw new AppError(
          "LAST_ADMIN",
          "마지막 관리자입니다. 다른 관리자를 먼저 지정해 주세요."
        );
      }
    }

    const data: Prisma.UserUpdateInput = {
      statusChangedAt: new Date(),
      statusChangedById: actor.id,
      ...(spec.next ? { status: spec.next } : {}),
      ...(t.kind === "CHANGE_ROLE" ? { role: t.role } : {}),
      /*
       * **사유 없는 전이는 옛 사유를 «지웁니다».**
       * 남겨두면 정지 해제된 회원의 «현재 상태» 옆에 예전 정지 사유가 계속 붙습니다 —
       * `statusReason` 은 「지금 상태가 왜 이런가」이지 이력이 아닙니다.
       * 이력은 감사 로그에 있습니다 (`FR-AUDIT-001`).
       */
      statusReason: "reason" in t ? t.reason : null,
    };

    await tx.user.update({ where: { id: targetId }, data });

    // 세션 «행» 은 같은 트랜잭션에서. 캐시는 커밋 후 (DEC-035 순서)
    const { count } = await deleteSessionsFor(tx, targetId);

    /*
     * **감사 로그도 같은 트랜잭션 안입니다** (`DEC-043`).
     *
     * 밖에 두면 「커밋 직후 DB 가 죽어 기록만 사라진다」가 가능한데,
     * 그것이 감사 추적이 가장 필요한 순간입니다. 되돌아가도 관리자가 다시
     * 누르면 그만이고, 사용자는 롤백된 승인을 본 적이 없습니다.
     *
     * `cacheInvalidated` 는 여기 싣지 않습니다 — **커밋 후에야 정해지고**,
     * 애초에 회원 상태 «이력»이 아니라 운영 신호입니다.
     */
    await audit.log(
      actor,
      {
        action: spec.action,
        targetType: "user",
        targetId,
        summary: `${spec.label} — ${target.username}`,
        diff: {
          status: { before: before.status, after: after.status },
          role: { before: before.role, after: after.role },
          sessions: { deleted: count },
          ...(batchId ? { batchId } : {}),
        },
      },
      tx
    );

    return { username: target.username, sessionsDeleted: count };
  });

  // ── 커밋 후 ──────────────────────────────────────────
  const cacheInvalidated = await invalidateSessionCache(targetId);
  if (!cacheInvalidated) {
    // 감사 로그가 아니라 **운영 로그**에 남긴다 (DEC-043). 화면에도 알린다.
    console.error(
      "[member] 세션 캐시 무효화 실패 — 최대 15분간 옛 스냅샷이 남을 수 있습니다:",
      targetId
    );
  }

  /*
   * 알림은 **트랜잭션 밖**입니다 (`DEC-038` 유지) — 일괄 승인에서 락을 오래 잡지
   * 않기 위해서입니다. 그리고 `ACTIVE`·`PENDING` 이 되는 전이에만 답니다
   * (`DEC-041`): 차단 상태로 가는 전이의 알림은 아무도 읽을 수 없습니다.
   */
  if (spec.notifyUser) {
    const n = spec.notifyUser(username);
    await notify.notify({
      userId: targetId,
      type: t.kind === "APPROVE" ? "APPROVED" : "SYSTEM",
      title: n.title,
      body: n.body,
      linkUrl: t.kind === "APPROVE" ? "/dashboard" : undefined,
    });
  }

  return {
    id: targetId,
    username,
    sessions: { deleted: sessionsDeleted, cacheInvalidated },
  };
}

// ─────────────────────────────────────────────────────
// 일괄 처리 (DEC-039) — 부분 성공
// ─────────────────────────────────────────────────────

export interface BulkResult {
  /**
   * `sessions` 를 함께 싣습니다 — **승인이야말로 이 신호가 필요한 전이**입니다.
   * 캐시 무효화가 실패하면 승인된 사용자가 최대 15분간 `/pending` 으로 튕기는데,
   * 관리자는 「승인 성공」만 보고 사용자는 「승인됐다는데 왜 못 들어가지」가 됩니다.
   */
  succeeded: {
    id: string;
    username: string;
    sessions: { deleted: number; cacheInvalidated: boolean };
  }[];
  /**
   * `username` 을 싣습니다. `id` 는 cuid 라 관리자가 화면에서 대조할 수 없고,
   * 그러면 `DEC-039` 가 부분 성공을 택한 이유(«어느 건이 문제였는지 알게 한다»)가
   * 결과에서 사라집니다.
   */
  failed: {
    id: string;
    username?: string;
    code: ErrorCode;
    message: string;
  }[];
}

export const BULK_LIMIT = 50;

/**
 * 각 건은 **독립 트랜잭션**입니다. 배치 전체를 한 트랜잭션으로 묶으면
 * advisory 락을 오래 잡아 그동안 다른 관리자가 아무것도 못 합니다.
 *
 * 3건이 실패했다고 47건을 되돌리지 않습니다 — 관리자는 **어느 3건이 문제였는지 모른 채
 * 50건을 다시 골라야** 합니다. 롤백이 사용자를 더 곤란하게 만듭니다.
 */
export async function transitionMany(
  actor: Actor,
  ids: string[],
  t: Transition
): Promise<BulkResult> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) {
    throw new AppError("VALIDATION_ERROR", "대상을 선택해 주세요.");
  }
  if (unique.length > BULK_LIMIT) {
    throw new AppError(
      "VALIDATION_ERROR",
      `한 번에 ${BULK_LIMIT}건까지 처리할 수 있습니다.`
    );
  }

  /*
   * 실패 건에 붙일 이름을 **먼저 한 번** 읽어 둡니다.
   * `transition` 이 `NOT_FOUND`·`INVALID_STATE` 로 던지면 이름을 돌려줄 길이 없고,
   * 예외마다 이름을 실어 올리면 `AppError` 가 대상 정보를 나르기 시작합니다.
   */
  const names = new Map(
    (
      await db.user.findMany({
        where: { id: { in: unique } },
        select: { id: true, username: true },
      })
    ).map((u) => [u.id, u.username] as const)
  );

  /*
   * 묶음 식별자 (`DEC-039`).
   * 없으면 일괄 승인 50건이 감사 로그에서 **서로 무관한 50행**으로 흩어져,
   * 나중에 「그때 그 배치가 무엇이었나」를 되짚을 수 없습니다.
   * 감사 로그는 소급 생성이 불가능하므로 지금 넣지 않으면 그 사이 기록에는 영원히 없습니다.
   */
  const batchId = randomUUID();

  const result: BulkResult = { succeeded: [], failed: [] };

  for (const id of unique) {
    try {
      const r = await transition(actor, id, t, batchId);
      result.succeeded.push({
        id,
        username: r.username,
        sessions: r.sessions,
      });
    } catch (e) {
      const username = names.get(id);
      if (e instanceof AppError) {
        result.failed.push({ id, username, code: e.code, message: e.message });
      } else {
        console.error("[member] 전이 실패", id, e);
        result.failed.push({
          id,
          username,
          code: "INTERNAL_ERROR",
          message: "처리하지 못했습니다.",
        });
      }
    }
  }

  return result;
}

/** 관리자 비밀번호 초기화 (FR-ADM-007) — 임시 비밀번호를 돌려준다 */
export async function resetPassword(
  actor: Actor,
  targetId: string,
  temporaryPassword: string,
  hash: (plain: string) => Promise<string>
): Promise<{ username: string; sessions: TransitionResult["sessions"] }> {
  /*
   * **자기 자신에게는 걸 수 없습니다.**
   *
   * 걸면 아래에서 자기 세션이 전부 끊기고, 임시 비밀번호는 화면의 토스트에만
   * 존재합니다. 그것을 놓친 관리자가 마지막 활성 관리자였다면 복구 경로는
   * 시드 스크립트뿐입니다 — `FR-ADM-009` 가 막으려는 상태를 옆문으로 만드는 셈입니다.
   * 본인 비밀번호는 마이페이지에서 «현재 비밀번호를 알고» 바꾸는 길이 이미 있습니다.
   */
  if (targetId === actor.id) {
    throw new AppError(
      "INVALID_STATE",
      "본인 비밀번호는 마이페이지에서 변경해 주세요. 여기서 초기화하면 지금 로그아웃됩니다."
    );
  }

  /*
   * **해시는 트랜잭션 «밖»에서** 만듭니다. argon2 는 실측 49ms(`password.ts`)라
   * 트랜잭션 안에 두면 그동안 커넥션과 트랜잭션을 붙잡습니다.
   */
  const passwordHash = await hash(temporaryPassword);

  const { username, count } = await db.$transaction(async (tx) => {
    // 조회도 **트랜잭션 안**에서 — 밖에서 읽으면 그 사이 사라진 대상이
    // `NOT_FOUND` 가 아니라 P2025 → `INTERNAL_ERROR` 로 나갑니다.
    const target = await tx.user.findUnique({
      where: { id: targetId },
      select: { username: true, status: true },
    });
    if (!target) throw new AppError("NOT_FOUND", "회원을 찾을 수 없습니다.");

    // 화면 메뉴와 **같은 표**를 본다 (`features/members/schema.ts`)
    if (!isResettableStatus(target.status)) {
      throw new AppError(
        "INVALID_STATE",
        `비밀번호를 초기화할 수 없는 상태입니다 (현재: ${target.status}).`
      );
    }

    await tx.user.update({
      where: { id: targetId },
      data: {
        passwordHash,
        // 최초 로그인 시 변경 강제 (FR-AUTH-011)
        mustChangePassword: true,
        passwordChangedAt: new Date(),
      },
    });

    const { count } = await deleteSessionsFor(tx, targetId);

    // 감사 로그도 같은 트랜잭션 (DEC-043)
    await audit.log(
      actor,
      {
        action: "USER_PASSWORD_RESET",
        targetType: "user",
        targetId,
        summary: `비밀번호 초기화 — ${target.username}`,
        diff: { sessions: { deleted: count } },
      },
      tx
    );

    return { username: target.username, count };
  });

  const cacheInvalidated = await invalidateSessionCache(targetId);

  await notify.notify({
    userId: targetId,
    type: "SYSTEM",
    title: "비밀번호가 초기화되었습니다",
    body: "관리자에게 임시 비밀번호를 받아 로그인한 뒤 변경해 주세요.",
  });

  return {
    username,
    sessions: { deleted: count, cacheInvalidated },
  };
}
