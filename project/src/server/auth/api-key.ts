import "server-only";

import { createHash } from "node:crypto";

import type { Scope } from "@/features/members/api-key.schema";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/server/auth/actor";
import { effectiveScopes } from "@/server/services/api-key.service";

/**
 * API 키 검증 — **웹 세션과 합류하는 두 번째 문** (`REQ-02 · 2.9` 계층 표).
 *
 * `guards.ts` 가 쿠키로 `Actor` 를 만드는 것과 짝입니다. 검증을 마치면 둘 다
 * 같은 `Actor` 가 되어 같은 service 계층을 지나갑니다 — 그래야 인가 규칙이
 * 한 곳에만 존재합니다 (`NFR-SEC-018`).
 *
 * ## 세 조건을 **한 함수에서 함께** 봅니다 (`DEC-037`·`DEV-02 · 2.7`)
 *
 * `revokedAt IS NULL` · `expiresAt > now()` · **소유자 `status = ACTIVE`**.
 * 나눠 두면 어느 하나를 빠뜨린 경로가 생깁니다.
 *
 * 세 번째 조건이 `DEC-037` 의 핵심입니다 — **정지·거부는 키를 «폐기»하지 않고
 * 매 요청 «판정»합니다.** 폐기하면 `SUSPENDED → ACTIVE` 로 돌아왔을 때 되살릴 수
 * 없고(`REQ-02 · 2.3`), 무효화 호출을 빠뜨리면 조용히 뚫립니다.
 *
 * ## 권한은 **키의 스코프**입니다 (`DEC-077`)
 *
 * 사람의 등급이 사라진 뒤 이 키가 무엇을 하는지는 **오직 스코프**가 정합니다 —
 * 헤르메스에게 「읽기만」, 오픈클로에게 「쓰기까지」를 다르게 줄 수 있는 자리가
 * 여기 하나입니다. `effectiveScopes` 는 DB 에 적힌 문자열을 **지금 있는 목록**으로
 * 거릅니다: 옛 키에 남은 없어진 스코프가 되살아나지 않게 하는 것이 그 일입니다.
 *
 * ## 여기 없는 것 (`P7`)
 *
 * HTTP 라우트(`/api/ingest/*`)·키 단위 레이트리밋은 `DEV-07` M3 몫입니다.
 * 이 파일은 **판정 함수**만 제공합니다 — 그래야 라우트 없이도
 * 「정지하면 API 키도 무효화된다」(M1 DoD)를 시연할 수 있습니다.
 */

/** 마지막 사용 시각을 매 요청 쓰지 않는다 — 세션의 `lastSeenAt` 과 같은 이유 */
const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export interface VerifiedKey {
  actor: Actor;
  /** 이 키가 **지금** 행사할 수 있는 권한 */
  scopes: Scope[];
}

/**
 * 원문 키 → `Actor`. 실패하면 **이유를 구분해** 던집니다.
 *
 * 이유를 나누는 것은 정보 노출이 아닙니다 — 키를 가진 사람에게 「만료됐다」와
 * 「폐기됐다」와 「없는 키다」는 **해야 할 일이 다릅니다.** 아이디 열거와 달리
 * 여기서 새는 것은 «그 키의 상태»뿐이고, 그건 키 소유자만 물을 수 있는 질문입니다.
 */
export async function verifyKey(raw: string): Promise<VerifiedKey> {
  /*
   * `findUnique` — `key_hash` 가 유니크입니다.
   *
   * 전에는 `findFirst` + 인덱스 없음이라 **매 API 요청이 `api_keys` 전체 스캔**이었고,
   * `P7` Ingest 의 인증 핫패스가 여기 하나입니다. 제약도 반대로 걸려 있었습니다 —
   * 키를 «식별»하는 것은 `key_hash` 인데 유니크는 `key_prefix`(48비트) 쪽에 있어서,
   * 식별에 쓰이지도 않으면서 **발급이 유니크 위반으로 실패할 경로**만 만들었습니다.
   */
  const key = await db.apiKey.findUnique({
    where: { keyHash: hashKey(raw) },
    select: {
      id: true,
      scopes: true,
      revokedAt: true,
      expiresAt: true,
      lastUsedAt: true,
      user: {
        select: { id: true, username: true, status: true },
      },
    },
  });

  if (!key) throw new AppError("KEY_INVALID", "유효하지 않은 API 키입니다.");
  if (key.revokedAt) throw new AppError("KEY_REVOKED", "폐기된 API 키입니다.");
  if (key.expiresAt.getTime() <= Date.now()) {
    throw new AppError("KEY_EXPIRED", "만료된 API 키입니다.");
  }
  /*
   * **소유자 상태가 세 번째 조건입니다** (`NFR-SEC-017`).
   * 웹에서 못 하는 일을 키로 할 수 있으면 `NFR-SEC-018`(같은 인가 계층)이 깨집니다.
   */
  if (key.user.status !== "ACTIVE") {
    throw new AppError(
      "KEY_INVALID",
      "이 계정은 현재 API 를 사용할 수 없습니다."
    );
  }

  await touchLastUsed(key.id, key.lastUsedAt);

  return {
    actor: {
      id: key.user.id,
      username: key.user.username,
      via: "MCP",
      apiKeyId: key.id,
    },
    // **키에 적힌 것을 그대로 믿지 않는다** — 지금 있는 스코프만 (DEC-037·DEC-077)
    scopes: effectiveScopes(key.scopes),
  };
}

/**
 * 이 요청이 해당 스코프를 가졌는지. 없으면 `SCOPE_INSUFFICIENT`.
 *
 * `verifyKey` 가 이미 «지금 있는 목록»으로 걸렀으므로 여기서 다시 거르지
 * 않습니다 — 규칙이 두 곳에 생깁니다.
 */
export function assertScope(verified: VerifiedKey, scope: Scope): void {
  if (!verified.scopes.includes(scope)) {
    throw new AppError(
      "SCOPE_INSUFFICIENT",
      `이 키에는 ${scope} 권한이 없습니다.`
    );
  }
}

async function touchLastUsed(keyId: string, lastUsedAt: Date | null) {
  const now = Date.now();
  if (lastUsedAt && now - lastUsedAt.getTime() < LAST_USED_WRITE_INTERVAL_MS) {
    return;
  }
  try {
    await db.apiKey.updateMany({
      where: { id: keyId },
      data: { lastUsedAt: new Date(now) },
    });
  } catch {
    // 갱신 실패로 요청을 막지 않는다. 다음 요청에서 다시 시도한다.
  }
}
