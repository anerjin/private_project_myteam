"use server";

import { z } from "zod";

import { type ActionResult, guard, ok } from "@/lib/result";
import { describePage } from "@/features/chat/page-context";
import { requireActor } from "@/server/auth/guards";
import * as chatService from "@/server/services/chat.service";

/**
 * 도우미 채팅 (`SCR-0xx`).
 *
 * **인가는 여기서 합니다** — 로그인한 활성 사용자만 부를 수 있습니다.
 * 채팅은 이 PC 의 CLI 를 띄우고 그 사용량은 구독 한도를 씁니다. 열어 두면
 * 로그인 안 한 사람이 남의 구독을 쓰게 됩니다.
 */

const askSchema = z.object({
  message: z.string().trim().min(1, "물어볼 말을 적어 주세요.").max(2000),
  /** 지금 보고 있는 경로 — 화면이 넘깁니다 */
  pathname: z.string().trim().max(500),
  query: z.string().trim().max(200).optional(),
  /** 이어서 물을 때. CLI 가 준 값만 유효합니다 */
  sessionId: z.string().trim().max(100).optional(),
});

export interface ChatAnswer {
  reply: string;
  sessionId: string | null;
  ms: number;
  toolsEnabled: boolean;
}

export async function askChatAction(
  input: unknown
): Promise<ActionResult<ChatAnswer>> {
  return guard(async () => {
    await requireActor();

    const parsed = askSchema.safeParse(input);
    if (!parsed.success) {
      const { validationError } = await import("@/lib/result");
      return validationError(parsed.error);
    }

    const { detail } = describePage(parsed.data.pathname, parsed.data.query);
    const r = await chatService.ask(
      parsed.data.message,
      detail,
      parsed.data.sessionId
    );

    return ok({
      reply: r.reply,
      sessionId: r.sessionId,
      ms: r.ms,
      toolsEnabled: r.toolsEnabled,
    });
  });
}

/** 패널이 처음 뜰 때 «쓸 수 있는 상태인가»를 묻습니다 */
export async function chatStatusAction(): Promise<
  ActionResult<{ available: boolean; tools: boolean }>
> {
  return guard(async () => {
    await requireActor();
    return ok({
      available: chatService.isAvailable(),
      tools: chatService.toolsConfigured(),
    });
  });
}
