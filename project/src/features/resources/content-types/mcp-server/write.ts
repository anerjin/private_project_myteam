import type { McpServerInput } from "@/features/resources/content-types/mcp-server/schema";

/**
 * `MCP_SERVER` — zod 출력 → 상세 테이블 행.
 *
 * ## `Json` 칸은 **`null` 이 아니라 빈 배열**입니다
 *
 * 처음엔 다른 칸처럼 `?? null` 로 썼는데 컴파일이 막았습니다. Prisma 의
 * nullable `Json` 은 JS `null` 을 안 받고 **`Prisma.DbNull` 이라는 전용 값**을
 * 요구합니다 — `null` 을 「JSON `null` 을 저장하라」와 구별해야 하기 때문입니다.
 *
 * 그런데 이 폴더는 `@prisma/client` 를 알면 안 됩니다(`DEC-051`, `check-deps`).
 * **경계가 우회 대신 판단을 강제한 자리**이고, 답은 간단합니다:
 * 「환경변수가 없다」는 **빈 목록**이지 「값이 없다」가 아닙니다.
 * `[]` 로 쓰면 수정에서 지운 것도 제대로 비워지고 Prisma 특수값도 안 씁니다.
 */
export function toRow(input: McpServerInput) {
  return {
    packageName: input.packageName ?? null,
    transport: input.transport,
    installCommand: input.installCommand ?? null,
    configJson: input.configJson,
    envVars: input.envVars ?? [],
    providedTools: input.providedTools ?? [],
    clientSupport: input.clientSupport ?? [],
    usageStatus: input.usageStatus ?? "REVIEWING",
  };
}
