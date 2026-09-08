import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type { Prisma } from "@prisma/client";

import {
  MAX_KEYS_PER_USER,
  SCOPES,
  type Scope,
} from "@/features/members/api-key.schema";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/server/auth/actor";
import * as audit from "@/server/services/audit.service";

/**
 * 개인 API 키 (FR-USER-008, REQ-02 · 2.8절, DEV-08 · 8.6절).
 *
 * ## 키가 답하는 질문 — 「이 키가 무엇까지 하는가」 (`DEC-037`·`DEC-077`)
 *
 * 사람의 등급이 사라진 뒤(`DEC-077`) **이 표가 이 시스템에 남은 유일한 권한
 * 구분**입니다. 헤르메스와 오픈클로가 같은 계정의 키로 붙지만, 하나에는
 * 「읽기만」을 주고 다른 하나에는 「쓰기까지」를 줄 수 있어야 합니다.
 * 그래서 **스코프 3종은 그대로 남습니다** — 없어진 것은 역할이 스코프를
 * «제한»하던 쪽이고, 키마다 스코프를 «고르는» 쪽이 아닙니다.
 *
 * ## 상태는 폐기가 아니라 판정입니다
 *
 * 정지돼도 **키를 폐기하지 않습니다** — 폐기하면 정지를 풀어도 돌아오지 않고,
 * 무효화 호출을 빠뜨리면 조용히 뚫립니다. `DEC-029`·`DEC-032`·`DEC-035` 가 세 번
 * 폐기한 «한 사실을 두 곳에» 구조입니다.
 *
 * - 정지 → **판정**(키를 건드리지 않음). `SUSPENDED → ACTIVE` 시 다시 유효해져야 하고
 *   (`REQ-02 · 2.3`), 폐기하면 되돌릴 수 없습니다. 판정은 `auth/api-key.verifyKey`.
 * - 탈퇴·강제 폐기 → **실제 폐기**(`revoked_at` 기록). 돌아오는 전이가 없습니다.
 */

/**
 * 스코프 목록과 개수 상한은 **화면과 같은 파일**에서 옵니다
 * (`features/members/api-key.schema.ts`) — service 는 `server-only` 라
 * 여기 두면 화면이 못 읽고 목록이 두 벌이 됩니다.
 */
export { SCOPES, type Scope } from "@/features/members/api-key.schema";

/**
 * 키가 실제로 행사할 수 있는 권한 — **DB 에 적힌 것을 지금의 목록으로 거릅니다.**
 *
 * ## 여기 `scopesAllowedFor(role)` 이 있었습니다 (`DEC-077` 로 지웠습니다)
 *
 * 그 함수는 「이 «역할»이 가질 수 있는 스코프」였고, `MEMBER` 에게서
 * `archive:run` 을 뺐습니다. 역할이 없어지면 그 뺄셈의 근거도 없어집니다 —
 * 그래서 **함수를 「전부 돌려주는 함수」로 남기지 않고 지웠습니다.** 언제나
 * 같은 값을 돌려주는 필터는 다음 사람에게 「무언가 거르고 있다」고 말합니다.
 *
 * `NFR-SEC-017`「발급자의 역할을 넘는 권한 부여 금지」가 지키려던 것은
 * **「키가 그 주인이 못 하는 일을 하게 되지 않는다」** 였습니다. 주인이 할 수
 * 있는 일에 등급 차가 없어진 지금 그 부등식은 자동으로 성립합니다 — 남은 것은
 * 아래 한 줄, **「목록에 없는 스코프는 권한이 아니다」** 입니다.
 *
 * 이 필터는 「없는 검사」가 아닙니다. `api_keys.scopes` 는 `String[]` 이라
 * **옛 키에 지금은 없는 스코프 문자열이 남아 있을 수 있고**, 그것을 그대로
 * 믿으면 지운 권한이 옛 키로 되살아납니다. 타입도 여기서 좁혀집니다
 * (`string[]` → `Scope[]`).
 */
export function effectiveScopes(keyScopes: string[]): Scope[] {
  const known = new Set<string>(SCOPES);
  return keyScopes.filter((s): s is Scope => known.has(s));
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

/**
 * 사용자별 발급 직렬화 락 (`DEC-036` 과 같은 장치).
 *
 * `count` → 검사 → `create` 를 트랜잭션 밖에서 하면 상한이 경합에서 무너집니다 —
 * **동시 8건을 던져 8개가 만들어지는 것을 실측했습니다**(상한 5).
 * 화면이 버튼을 잠그지만 **화면은 방어선이 아닙니다** (`DEC-035`).
 *
 * 회원 전이(`MEMBER_STATE_LOCK`)와 달리 **사용자별**로 잠급니다 — 키 발급은
 * 서로 다른 사용자끼리 경쟁할 이유가 없고, 전역 락을 쓰면 관리자 작업까지 줄을 섭니다.
 */
const API_KEY_LOCK_NAMESPACE = 51420002;

export async function issue(
  actor: Actor,
  name: string,
  scopes: string[]
): Promise<IssuedKey> {
  /*
   * **발급도 `SCOPES` 를 봅니다** — 요청 때 거르는 `effectiveScopes` 와 같은 목록.
   * 액션이 zod 로 이미 걸렀지만 **화면도 액션도 방어선이 아닙니다** (`DEC-035`):
   * service 를 직접 부르는 스크립트가 이미 여럿 있습니다(`scripts/verify-p3-keys`).
   * 걸러지지 않으면 목록에 없는 문자열이 `api_keys.scopes` 에 그대로 저장됩니다.
   */
  const known = new Set<string>(SCOPES);
  const invalid = scopes.filter((s) => !known.has(s));
  if (invalid.length > 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      `없는 스코프입니다: ${invalid.join(", ")}`,
      { scopes: [`없는 스코프: ${invalid.join(", ")}`] }
    );
  }
  // 같은 스코프를 여러 번 넣어도 한 번만 저장한다
  const unique = [...new Set(scopes)];

  const raw = `nw_live_${randomBytes(24).toString("base64url")}`;
  const keyPrefix = raw.slice(0, "nw_live_".length + PREFIX_LENGTH);
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  const key = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${API_KEY_LOCK_NAMESPACE}, hashtext(${actor.id}))`;

    /*
     * **만료된 키는 자리를 차지하지 않습니다.**
     * 전에는 `revokedAt: null` 만 봐서, 키 수명이 365일 고정인 탓에
     * **1년 뒤 모든 사용자가 「만료된 키 5개」로 발급이 막히는 상태**에 도달했습니다.
     * 상한의 뜻은 「지금 쓸 수 있는 키」입니다.
     */
    const alive = await tx.apiKey.count({
      where: {
        userId: actor.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (alive >= MAX_KEYS_PER_USER) {
      throw new AppError(
        "VALIDATION_ERROR",
        `키는 사용자당 최대 ${MAX_KEYS_PER_USER}개까지 만들 수 있습니다. 쓰지 않는 키를 폐기해 주세요.`
      );
    }

    const created = await tx.apiKey.create({
      data: {
        userId: actor.id,
        name,
        keyPrefix,
        keyHash: hashKey(raw),
        scopes: unique,
        expiresAt,
      },
    });

    // 감사 로그는 같은 트랜잭션 (DEC-043)
    await audit.log(
      actor,
      {
        action: "APIKEY_CREATE",
        targetType: "api_key",
        targetId: created.id,
        summary: `API 키 발급 — ${name}`,
        // **원문도 해시도 남기지 않는다** (NFR-PRIV-004)
        diff: { scopes: unique, keyPrefix },
      },
      tx
    );

    return created;
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

/**
 * 키 하나 폐기 (`FR-USER-008` · `FR-ADM-016`).
 *
 * **「본인 또는 `ADMIN`」이었습니다.** `DEC-077` 로 사람이 전부 관리자가 되면서
 * 뒤쪽 항이 언제나 참이 되어 검사 전체가 접혔습니다 — `FR-ADM-016`(강제 폐기)은
 * 「관리자는 남의 키도 폐기한다」이고, 그 관리자가 이제 로그인한 사람 전부입니다.
 * 접힌 조건을 남겨 두면 다음 사람이 없는 등급을 찾습니다.
 */
export async function revoke(actor: Actor, keyId: string): Promise<void> {
  const key = await db.apiKey.findUnique({
    where: { id: keyId },
    select: { id: true, userId: true, name: true, revokedAt: true },
  });
  if (!key) throw new AppError("NOT_FOUND", "키를 찾을 수 없습니다.");

  await db.$transaction(async (tx) => {
    /*
     * **`updateMany` + `count` 로 검사와 쓰기를 한 문장에 둡니다.**
     * 전에는 `findUnique` 로 읽고 `update` 로 썼는데, 그 사이에 다른 요청이 끼면
     * 「이미 폐기된 키입니다」 가드를 둘 다 통과해 **감사 로그가 두 줄** 남았습니다
     * (동시 폐기 2건 → 성공 2 · 로그 2건으로 실측됨).
     */
    const { count } = await tx.apiKey.updateMany({
      where: { id: keyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedBy: actor.id },
    });
    if (count === 0) {
      throw new AppError("INVALID_STATE", "이미 폐기된 키입니다.");
    }

    // 감사 로그는 같은 트랜잭션 (DEC-043)
    await audit.log(
      actor,
      {
        action: "APIKEY_REVOKE",
        targetType: "api_key",
        targetId: keyId,
        summary: `API 키 폐기 — ${key.name}`,
      },
      tx
    );
  });
}

/**
 * 회원의 키 전량 폐기.
 *
 * **관리자 강제 폐기(`FR-ADM-016`)와 본인 탈퇴(`DEC-021`)가 같은 문을 씁니다.**
 * 탈퇴는 「돌아오는 전이가 없는」 쪽이라 판정이 아니라 실제 폐기입니다 (`DEC-037`).
 *
 * 이름이 `revokeAllKeysFor` 인 이유: `session.revokeAllFor(userId, exceptSessionId)` 와
 * **이름이 같고 인자 순서가 달랐습니다.** 검색이 갈라지고, 잘못 부르면 타입이 맞아
 * 조용히 통과합니다 (`bumpGeneration` 별칭을 없앤 것과 같은 이유).
 *
 * 인가 검사가 여기 있었습니다 — 「`ADMIN` 이거나 본인」. `DEC-077` 로 사람이
 * 전부 관리자가 되면서 통째로 접혔습니다(`revoke()` 와 같은 이유·같은 자리).
 * **남은 문은 로그인**입니다: 이 함수를 부르는 액션은 `requireActor()` 를 지납니다.
 */
export async function revokeAllKeysFor(
  actor: Actor,
  userId: string
): Promise<number> {
  return db.$transaction(async (tx) => {
    // **무엇을 지웠는지 먼저 읽습니다.** 개수만 남기면 회원이 「내 키가 왜 죽었냐」고
    // 물었을 때 답이 「3개」뿐입니다 — 단건 폐기는 이름을 남기는데(아래) 강제 폐기가
    // 오히려 근거가 얇았습니다 (`FR-AUDIT-001`).
    const targets = await tx.apiKey.findMany({
      where: { userId, revokedAt: null },
      select: { id: true, name: true },
    });
    if (targets.length === 0) return 0;

    await tx.apiKey.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedBy: actor.id },
    });

    // 감사 로그는 같은 트랜잭션 (DEC-043)
    await audit.log(
      actor,
      {
        action: "APIKEY_REVOKE",
        targetType: "user",
        targetId: userId,
        summary: `API 키 전량 폐기 — ${targets.length}개`,
        diff: { revoked: targets },
      },
      tx
    );

    return targets.length;
  });
}

/**
 * 트랜잭션 안에서 한 회원의 키를 전부 폐기한다 — **탈퇴 전용**.
 *
 * ## 왜 `revokeAllKeysFor` 를 안 쓰는가
 *
 * 그쪽은 자기 트랜잭션을 열고 감사 로그를 따로 남깁니다. 탈퇴는 **이미
 * 트랜잭션 안**이고(`member.service.transition`), 거기서 또 트랜잭션을 열면
 * 회원 상태는 커밋됐는데 키는 롤백되는 상태가 가능해집니다.
 *
 * ## 왜 여기 있는가
 *
 * `api_keys` 쓰기는 이 파일과 `auth/api-key.ts` 만 합니다 (`DEC-037`·`DEC-044`).
 * `member.service` 에서 직접 `tx.apiKey.updateMany` 를 부르면
 * `check-deps` 가 막습니다 — 실제로 막혔고, 그 규칙이 옳습니다:
 * 「정지는 폐기가 아니라 판정」이라는 전제가 흐려지는 자리가 바로 여기입니다.
 *
 * **감사 로그를 여기서 안 남깁니다.** 부르는 쪽이 `USER_WITHDRAW` 한 줄에
 * 개수를 실어 남깁니다 — 탈퇴 한 번에 로그 두 줄은 읽는 사람을 헷갈리게 합니다.
 */
export async function revokeAllInTx(
  tx: Prisma.TransactionClient,
  userId: string,
  revokedBy: string
): Promise<number> {
  const { count } = await tx.apiKey.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedBy },
  });
  return count;
}
