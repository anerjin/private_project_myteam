import "server-only";

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import type { Actor } from "@/server/auth/actor";

/**
 * 감사 로그 (FR-AUDIT-001, REQ-02 · 2.10절).
 *
 * ## 트랜잭션을 주면 본 작업과 운명을 같이합니다 (`DEC-043`, `DEC-038` 개정)
 *
 * 전에는 **모든** 기록이 실패를 삼켰습니다. 근거는 「승인이 성공했는데 로그를 못
 * 남겼다고 승인을 취소하면 사용자가 더 곤란해진다」였는데, 그 판단은 **트랜잭션이
 * 없는 인증 경로**의 것이었습니다. 로그인은 로그를 못 남겼다고 막으면 서비스가 죽습니다.
 *
 * 회원 상태 전이는 다릅니다. **되돌려도 관리자가 다시 누르면 그만**이고, 사용자는
 * 롤백된 승인을 본 적이 없습니다. 반대로 커밋 직후 DB 가 죽어 로그만 사라지면
 * **그것이 감사 추적이 가장 필요한 순간**입니다 (`FR-AUDIT-001` 「예외 없이 기록」).
 *
 * 그래서 규칙은 하나입니다 — **`tx` 를 주면 던지고, 안 주면 삼킨다.**
 * 함수를 두 개로 나누면 「어느 쪽을 부를지」가 두 번째 규칙이 됩니다.
 *
 * **알림은 여전히 트랜잭션 밖입니다** (`DEC-038` 유지) — 일괄 승인에서
 * advisory 락을 오래 잡지 않기 위해서입니다.
 *
 * **비밀번호·API 키 원문은 절대 넣지 않습니다** (`NFR-PRIV-004`).
 */

export type AuditAction =
  | "USER_SIGNUP"
  | "USER_SIGNIN"
  | "USER_SIGNIN_FAILED"
  /** 비밀번호는 맞았지만 계정 상태로 막힌 경우 — 자격 증명 유출 신호 */
  | "USER_SIGNIN_BLOCKED"
  | "USER_SIGNOUT"
  | "USER_APPROVE"
  | "USER_REJECT"
  /** 거부를 되돌려 재검토 대기로 (DEC-042) */
  | "USER_REOPEN"
  | "USER_SUSPEND"
  | "USER_REACTIVATE"
  | "USER_ROLE_CHANGE"
  | "USER_PASSWORD_CHANGE"
  | "USER_PASSWORD_RESET"
  | "USER_WITHDRAW"
  | "APIKEY_CREATE"
  | "APIKEY_REVOKE"
  | "RESOURCE_CREATE"
  | "RESOURCE_UPDATE"
  | "RESOURCE_DELETE"
  | "RESOURCE_RESTORE"
  | "RESOURCE_PURGE"
  | "SETTING_UPDATE";

export interface AuditInput {
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  /** 사람이 읽는 한 줄. 목록에서 이것만 보고도 무슨 일인지 알아야 한다 */
  summary: string;
  /** `{ field: { before, after } }` */
  diff?: Prisma.InputJsonValue;
}

/**
 * 행위자가 있는 기록.
 *
 * `actorUsername` 을 **스냅샷으로 함께 저장**합니다. 계정이 익명화돼도
 * 「누가 했는지」가 남아야 합니다 (`DEC-021`, `DEV-02 · TBL-audit_logs`).
 */
/**
 * 트랜잭션 안에서 기록한다. **본 작업과 운명을 같이합니다** (`DEC-043`).
 *
 * `tx` 가 **필수**인 것이 이 함수의 요점입니다. 선택 인자로 두었더니
 * 같은 커밋 안에서 회원 전이에는 넣고 API 키에는 빠뜨렸습니다 —
 * **빠뜨려도 컴파일되는 규칙은 반드시 절반에서 빠집니다** (`DEC-044` 가 없앤 그 형태).
 */
export async function log(
  actor: Actor,
  input: AuditInput,
  tx: Prisma.TransactionClient
): Promise<void> {
  await tx.auditLog.create({ data: toRow(actor, input) });
}

/**
 * 트랜잭션 «없이» 기록하고, **실패를 삼킵니다** (`DEC-043`).
 *
 * **이름이 곧 사유 요구입니다** — 이 함수가 보이면 「왜 트랜잭션 밖인가」를
 * 묻게 됩니다. 정당한 자리는 **되돌릴 본 작업이 없는 인증 경로**뿐입니다:
 * 로그인 성공·실패·차단·로그아웃. 로그를 못 남겼다고 로그인을 막으면
 * DB 가 흔들릴 때 서비스가 통째로 죽습니다.
 */
export async function logDetached(
  actor: Actor,
  input: AuditInput
): Promise<void> {
  try {
    await db.auditLog.create({ data: toRow(actor, input) });
  } catch (e) {
    console.error("[audit] 기록 실패 — 본 작업은 유지됩니다:", input.action, e);
  }
}

function toRow(actor: Actor, input: AuditInput) {
  return {
    actorId: actor.id,
    actorUsername: actor.username,
    via: actor.via,
    apiKeyId: actor.apiKeyId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    summary: input.summary,
    diff: input.diff,
    ip: actor.ip,
    userAgent: actor.userAgent,
  };
}

/**
 * 행위자가 없는 기록 (로그인 실패 등).
 *
 * `actor_id` 는 NULL 이지만 **시도한 아이디는 남깁니다** — 무차별 대입을
 * 추적하려면 어떤 아이디가 두들겨 맞았는지 알아야 합니다.
 */
export async function logAnonymous(
  input: AuditInput & {
    attemptedUsername?: string;
    ip?: string;
    userAgent?: string;
  }
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorUsername: input.attemptedUsername,
        via: "WEB",
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        summary: input.summary,
        ip: input.ip,
        userAgent: input.userAgent,
      },
    });
  } catch (e) {
    console.error("[audit] 익명 기록 실패:", input.action, e);
  }
}
