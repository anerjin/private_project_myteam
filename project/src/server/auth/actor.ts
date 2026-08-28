import "server-only";

import type { Role } from "@prisma/client";

/**
 * 행위자 컨텍스트.
 *
 * **웹 세션과 API 키가 같은 모양으로 합류하는 지점입니다** (`NFR-SEC-018`).
 * 검증을 마치면 둘 다 이 타입이 되어 같은 service 계층을 지나갑니다 —
 * 그래야 인가 규칙이 한 곳에만 존재합니다.
 *
 * service 는 요청 컨텍스트(`next/headers`)에 의존하지 않으므로
 * **이 값을 파라미터로 받습니다** (`DEV-06 · 6.6절`). 그래야 워커에서도 재사용됩니다.
 */
export interface Actor {
  id: string;
  username: string;
  role: Role;
  /** 어느 경로로 수행했는지 — 감사 로그에 남는다 (DEV-02 · TBL-audit_logs) */
  via: "WEB" | "MCP";
  /** `via = "MCP"` 일 때 어떤 키였는지 */
  apiKeyId?: string;
  /** 감사 로그용. 없으면 기록하지 않는다 */
  ip?: string;
  userAgent?: string;
}

/** `EDITOR` 이상인가 */
export function isEditor(actor: Actor): boolean {
  return actor.role === "EDITOR" || actor.role === "ADMIN";
}

export function isAdmin(actor: Actor): boolean {
  return actor.role === "ADMIN";
}

/**
 * 자료를 수정·삭제할 수 있는가 (REQ-02 · 2.5절).
 *
 * 소유권은 데이터를 봐야 알 수 있으므로 **service 에서 판정**합니다.
 * 액션은 이 함수를 부르기 위해 먼저 대상을 조회합니다 (`DEV-05 · 5.10절` 3단계).
 */
export function canEditResource(actor: Actor, authorId: string): boolean {
  return isEditor(actor) || actor.id === authorId;
}
