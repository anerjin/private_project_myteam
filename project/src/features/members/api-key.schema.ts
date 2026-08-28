import { z } from "zod";

/**
 * API 키 입력 규칙 (FR-USER-008, REQ-02 · 2.8절).
 *
 * **서버와 화면이 같은 값을 봅니다.** 전에는 `MAX_KEYS` 가 service(`5`)와 패널(`5`)에
 * 각각 있었고, 스코프 라벨은 `SCOPES` 와 짝이 어긋날 수 있는 두 번째 목록이었습니다.
 * `reasonSchema` 를 한 곳으로 모은 것과 **같은 자리·같은 이유**입니다 —
 * 규칙이 두 곳에 있으면 한 곳만 고치는 날이 옵니다 (`DEC-029`·`DEC-032`·`DEC-037`).
 *
 * service 는 `server-only` 라 화면이 못 읽습니다. 그래서 **양쪽이 읽을 수 있는 여기**에 둡니다.
 */

/** 사용자당 만들 수 있는 «지금 쓸 수 있는» 키의 수 (FR-USER-008) */
export const MAX_KEYS_PER_USER = 5;

export const SCOPES = [
  "resources:read",
  "resources:write",
  "archive:run",
] as const;

export type Scope = (typeof SCOPES)[number];

/**
 * 화면에 보여줄 이름. **`SCOPES` 를 키로 하는 `Record` 라** 스코프를 추가하면
 * 타입 오류가 나서 라벨을 빠뜨릴 수 없습니다 — 목록이 두 벌이 아니라 한 벌입니다.
 */
export const SCOPE_LABEL: Record<Scope, string> = {
  "resources:read": "자료 읽기",
  "resources:write": "자료 쓰기",
  "archive:run": "아카이브 실행",
};

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1, "키 이름을 적어 주세요.").max(50),
  scopes: z
    .array(z.enum(SCOPES))
    .min(1, "스코프를 하나 이상 선택해 주세요.")
    .max(SCOPES.length),
});
