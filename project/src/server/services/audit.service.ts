import "server-only";

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import type { Actor } from "@/server/auth/actor";

/**
 * 감사 로그 (FR-AUDIT-001, REQ-02 · 2.10절).
 *
 * **기록에 실패해도 본 작업을 되돌리지 않습니다.** 승인이 성공했는데 로그를 못 남겼다고
 * 승인을 취소하면 사용자가 더 곤란해집니다. 대신 서버 로그에 크게 남깁니다.
 *
 * **비밀번호·API 키 원문은 절대 넣지 않습니다** (`NFR-PRIV-004`).
 */

export type AuditAction =
  | "USER_SIGNUP"
  | "USER_SIGNIN"
  | "USER_SIGNIN_FAILED"
  | "USER_SIGNOUT"
  | "USER_APPROVE"
  | "USER_REJECT"
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
export async function log(actor: Actor, input: AuditInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
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
      },
    });
  } catch (e) {
    console.error("[audit] 기록 실패 — 본 작업은 유지됩니다:", input.action, e);
  }
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
