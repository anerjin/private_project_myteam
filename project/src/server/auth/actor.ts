import "server-only";

/**
 * 행위자 컨텍스트.
 *
 * **웹 세션과 API 키가 같은 모양으로 합류하는 지점입니다** (`NFR-SEC-018`).
 * 검증을 마치면 둘 다 이 타입이 되어 같은 service 계층을 지나갑니다 —
 * 그래야 인가 규칙이 한 곳에만 존재합니다.
 *
 * service 는 요청 컨텍스트(`next/headers`)에 의존하지 않으므로
 * **이 값을 파라미터로 받습니다** (`DEV-06 · 6.6절`). 그래야 워커에서도 재사용됩니다.
 *
 * ## `role` 이 여기 있었습니다 — 지웠습니다 (`DEC-077`)
 *
 * `isEditor`·`isAdmin`·`canEditResource` 도 함께 사라졌습니다. 쓰는 «사람»이
 * 운영자 한 명이면 세 등급은 값이 하나뿐인 칸이고, 그 칸을 보는 분기는 전부
 * 「참」으로 접힙니다. **접힌 분기를 남겨 두면 다음 사람이 없는 등급을 찾습니다.**
 *
 * 그래서 지금 이 시스템의 인가는 두 겹입니다:
 *
 * | | 무엇이 막는가 |
 * | --- | --- |
 * | 웹 (`via: "WEB"`) | **로그인했는가** — `guards.requireActor()` / `requireActiveUser()` |
 * | 에이전트 (`via: "MCP"`) | **키에 그 스코프가 있는가** — `auth/api-key.assertScope()` |
 *
 * 「누구의 것인가」로 갈리는 자리는 **역할이 아니라 소유권**이라 그대로 남습니다:
 * 개인 메모(`note.service` — `ownerId` 만 받습니다)와 댓글 «고치기»(작성자 본인만)가
 * 그렇습니다. 이 둘은 `DEC-077` 전에도 관리자에게 열려 있지 않았습니다.
 */
export interface Actor {
  id: string;
  username: string;
  /** 어느 경로로 수행했는지 — 감사 로그에 남는다 (DEV-02 · TBL-audit_logs) */
  via: "WEB" | "MCP";
  /** `via = "MCP"` 일 때 어떤 키였는지 */
  apiKeyId?: string;
  /** 감사 로그용. 없으면 기록하지 않는다 */
  ip?: string;
  userAgent?: string;
}
