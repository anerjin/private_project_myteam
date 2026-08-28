import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type { Role } from "@prisma/client";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/server/auth/actor";
import * as audit from "@/server/services/audit.service";

/**
 * 개인 API 키 (FR-USER-008, REQ-02 · 2.8절, DEV-08 · 8.6절).
 *
 * ## 키는 역할을 복제하지 않습니다 (`DEC-037`)
 *
 * 실제 권한 = **`키 스코프 ∩ 현재 역할이 할 수 있는 것`**, 매 요청 계산.
 * 역할이 강등돼도 **키를 폐기하지 않습니다** — 폐기하면 승격해도 돌아오지 않고,
 * 무효화 호출을 빠뜨리면 조용히 뚫립니다. `DEC-029`·`DEC-032`·`DEC-035` 가 세 번
 * 폐기한 «한 사실을 두 곳에» 구조입니다.
 *
 * - 정지·거부 → **판정**(키를 건드리지 않음). `SUSPENDED → ACTIVE` 시 다시 유효해져야 하고
 *   (`REQ-02 · 2.3`), 폐기하면 되돌릴 수 없습니다.
 * - 탈퇴·관리자 강제 폐기 → **실제 폐기**(`revoked_at` 기록). 돌아오는 전이가 없습니다.
 */

export const SCOPES = [
  "resources:read",
  "resources:write",
  "archive:run",
] as const;

export type Scope = (typeof SCOPES)[number];

/**
 * 이 역할이 가질 수 있는 스코프 (`DEC-037`).
 *
 * **오늘은 항상 전량을 돌려줍니다** — 스코프 3종 중 역할 전용이 없습니다
 * (`MEMBER` 도 본인 자료 쓰기·아카이브 실행이 가능합니다).
 * 그래도 함수로 둔 이유는 **«상한»이 코드 안에 자리를 갖게** 하기 위해서입니다.
 * 발급 시 선택 목록과 요청 시 교집합이 **같은 함수**를 쓰므로,
 * 역할 전용 스코프가 생기는 날 **고칠 곳이 한 곳**입니다.
 */
export function scopesAllowedFor(role: Role): readonly Scope[] {
  // 오늘은 역할과 무관하다. 인자를 지우지 않는 이유는 위 주석 그대로 —
  // 역할 전용 스코프가 생기는 날 **이 함수 안만** 고치면 되게 하기 위해서다.
  void role;
  return SCOPES;
}

/** 키가 실제로 행사할 수 있는 권한 — 발급 시점이 아니라 **지금** 역할로 계산한다 */
export function effectiveScopes(keyScopes: string[], role: Role): Scope[] {
  const allowed = new Set<string>(scopesAllowedFor(role));
  return keyScopes.filter((s): s is Scope => allowed.has(s));
}

const PREFIX_LENGTH = 8;

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export interface IssuedKey {
  id: string;
  name: string;
  /** **한 번만** 돌려준다. 저장하지 않는다 (NFR-SEC-017) */
  plaintext: string;
  keyPrefix: string;
  expiresAt: Date;
}

const MAX_KEYS_PER_USER = 5;

export async function issue(
  actor: Actor,
  name: string,
  scopes: string[]
): Promise<IssuedKey> {
  const alive = await db.apiKey.count({
    where: { userId: actor.id, revokedAt: null },
  });
  if (alive >= MAX_KEYS_PER_USER) {
    throw new AppError(
      "VALIDATION_ERROR",
      `키는 사용자당 최대 ${MAX_KEYS_PER_USER}개까지 만들 수 있습니다.`
    );
  }

  // 발급 상한도 같은 함수로 본다 (DEC-037)
  const allowed = new Set<string>(scopesAllowedFor(actor.role));
  const invalid = scopes.filter((s) => !allowed.has(s));
  if (invalid.length > 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      `이 역할로는 선택할 수 없는 스코프입니다: ${invalid.join(", ")}`,
      { scopes: [`선택할 수 없는 스코프: ${invalid.join(", ")}`] }
    );
  }

  const raw = `qb_live_${randomBytes(24).toString("base64url")}`;
  const keyPrefix = raw.slice(0, "qb_live_".length + PREFIX_LENGTH);
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  const key = await db.apiKey.create({
    data: {
      userId: actor.id,
      name,
      keyPrefix,
      keyHash: hashKey(raw),
      scopes,
      expiresAt,
    },
  });

  await audit.log(actor, {
    action: "APIKEY_CREATE",
    targetType: "api_key",
    targetId: key.id,
    summary: `API 키 발급 — ${name}`,
    // **원문도 해시도 남기지 않는다** (NFR-PRIV-004)
    diff: { scopes, keyPrefix },
  });

  return { id: key.id, name, plaintext: raw, keyPrefix, expiresAt };
}

export function listFor(userId: string) {
  return db.apiKey.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

/** 본인 또는 관리자가 폐기 (FR-USER-008 · FR-ADM-016) */
export async function revoke(actor: Actor, keyId: string): Promise<void> {
  const key = await db.apiKey.findUnique({
    where: { id: keyId },
    select: { id: true, userId: true, name: true, revokedAt: true },
  });
  if (!key) throw new AppError("NOT_FOUND", "키를 찾을 수 없습니다.");

  if (key.userId !== actor.id && actor.role !== "ADMIN") {
    throw new AppError("FORBIDDEN", "이 키를 폐기할 권한이 없습니다.");
  }
  if (key.revokedAt) {
    throw new AppError("INVALID_STATE", "이미 폐기된 키입니다.");
  }

  await db.apiKey.update({
    where: { id: keyId },
    data: { revokedAt: new Date(), revokedBy: actor.id },
  });

  await audit.log(actor, {
    action: "APIKEY_REVOKE",
    targetType: "api_key",
    targetId: keyId,
    summary: `API 키 폐기 — ${key.name}`,
  });
}

/** FR-ADM-016 회원의 키 전량 강제 폐기 */
export async function revokeAllFor(
  actor: Actor,
  userId: string
): Promise<number> {
  const { count } = await db.apiKey.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedBy: actor.id },
  });

  if (count > 0) {
    await audit.log(actor, {
      action: "APIKEY_REVOKE",
      targetType: "user",
      targetId: userId,
      summary: `API 키 강제 폐기 — ${count}개`,
      diff: { revoked: count },
    });
  }
  return count;
}
