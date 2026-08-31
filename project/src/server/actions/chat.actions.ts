"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { describePage } from "@/features/chat/page-context";
import { getContentType } from "@/features/resources/content-types";
import { parseResourceInput } from "@/features/resources/form.schema";
import { type ActionResult, guard, ok } from "@/lib/result";
import { requireActor } from "@/server/auth/guards";
import "@/server/jobs";
import * as chatService from "@/server/services/chat.service";
import * as jobService from "@/server/services/job.service";
import * as resourceWrite from "@/server/services/resource.write";

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
  /** 자동 등록이 일어났으면 그 결과 — 화면이 링크와 「되돌리기」를 그립니다 */
  created?: { id: string; title: string; href: string };
  /** 등록을 시도했지만 못 한 이유 (중복·검증 실패) */
  registerNote?: string;
}

/**
 * 답에서 등록 블록을 떼어낸다.
 *
 * **모델에게 등록 «도구»를 주지 않았습니다.** 도구를 주면 `CHAT_API_KEY` 의
 * 주인(`ai_collector`)이 작성자가 됩니다 — 물어본 사람이 아니라. 대신 모델은
 * «무엇을 등록할지»만 적고, **넣는 것은 우리 서버가 로그인한 본인으로** 합니다.
 *
 * 그래서 작성자·권한·감사 기록이 전부 그 사람 것이 됩니다.
 */
const BLOCK = /```queenbee-register\s*\n([\s\S]*?)```/;

function takeProposal(reply: string): { text: string; proposal: unknown | null } {
  const m = BLOCK.exec(reply);
  if (!m) return { text: reply, proposal: null };
  // 블록은 화면에서 지웁니다 — 사용자에게 JSON 을 보여 줄 이유가 없습니다
  const text = reply.replace(BLOCK, "").trim();
  try {
    return { text, proposal: JSON.parse(m[1]!) };
  } catch {
    return { text, proposal: null };
  }
}

export async function askChatAction(
  input: unknown
): Promise<ActionResult<ChatAnswer>> {
  return guard(async () => {
    const actor = await requireActor();

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

    const { text, proposal } = takeProposal(r.reply);
    const base = {
      reply: text,
      sessionId: r.sessionId,
      ms: r.ms,
      toolsEnabled: r.toolsEnabled,
    };
    if (!proposal) return ok(base);

    /*
     * **웹 폼·Ingest 와 «같은» zod 를 지납니다** (`NFR-SEC-018` 과 같은 정신).
     * 채팅만 다른 검증을 쓰면 화면으로는 못 넣는 값이 대화로는 들어갑니다.
     */
    const checked = parseResourceInput(proposal);
    if (!checked.ok) {
      const first = Object.entries(checked.fieldErrors)[0];
      return ok({
        ...base,
        registerNote: first
          ? `등록하지 못했습니다 — ${first[0]}: ${first[1][0]}`
          : "등록하지 못했습니다 — 입력값을 확인해 주세요.",
      });
    }

    /*
     * **중복이면 넣지 않습니다** (`DEC-047`). 사람이 화면에서 넣을 때는
     * 배너를 보고 판단하지만, 여기서는 한 마디에 조용히 두 벌이 생깁니다.
     */
    if (checked.data.url) {
      const dup = await resourceWrite.findDuplicate(checked.data.url);
      if (dup) {
        return ok({
          ...base,
          registerNote: `이미 있는 자료입니다 — 「${dup.title}」`,
        });
      }
    }

    const made = await resourceWrite.create(actor, checked.data);

    // GitHub 저장소는 메타를 받아 옵니다 — Ingest 라우트와 같은 처리입니다
    if (made.type === "GITHUB_REPO") {
      await jobService.enqueueAndRun({
        type: "FETCH_GITHUB_META",
        resourceId: made.id,
        requestedById: actor.id,
      });
    }

    revalidatePath("/resources");
    revalidatePath("/dashboard");

    return ok({
      ...base,
      created: {
        id: made.id,
        title: checked.data.title,
        href: `/resources/${getContentType(made.type).slug}/${made.slug}`,
      },
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
