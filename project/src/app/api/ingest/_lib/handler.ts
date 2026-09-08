import "server-only";

import { AppError, httpStatusOf } from "@/lib/errors";
import { consume } from "@/lib/rate-limit";
import type { Actor } from "@/server/auth/actor";
import { assertScope, verifyKey } from "@/server/auth/api-key";
import type { Scope } from "@/features/members/api-key.schema";

/**
 * Ingest 라우트의 공통 껍데기 (`DEV-05 · 5.11`, `NFR-SEC-018`).
 *
 * ## 웹과 **같은 service** 를 지납니다
 *
 * `NFR-SEC-018` 이 그렇게 정했습니다. 그래서 여기서 하는 일은 **`Actor` 를
 * 만드는 것**뿐이고, 「무엇을 할 수 있는가」는 service 가 그 `Actor` 로 판정합니다
 * — 웹의 `requireActor()` 와 같은 자리입니다.
 *
 * ## 그런데 **정책은 진입점마다 다릅니다**
 *
 * 중복 URL 을 웹은 「그대로 등록」으로 받고 MCP 는 `409` 로 거절합니다
 * (`DEC-047`). 에이전트는 20개 URL 루프를 돌며 **조용히** 중복을 만들 수 있고,
 * 사람은 배너를 보고 «의식하고» 고릅니다. 한 DB 제약이 두 정책을 낼 수 없으므로
 * **그 비대칭은 service 가 아니라 여기(라우트)에** 있습니다.
 *
 * ## 키마다 세는 레이트 리밋
 *
 * 사용자 단위가 아니라 **키 단위**입니다. 노트북과 데스크톱이 각자 키를 쓰면
 * 한쪽이 다른 쪽을 막지 않아야 하고, 폐기된 키를 다시 만들면 한도도 새로
 * 시작해야 합니다.
 */

export interface IngestContext {
  actor: Actor;
  /** 키 소유자의 스코프 — `whoami` 가 그대로 보여준다 */
  scopes: Scope[];
  req: Request;
  url: URL;
}

/** `DEV-05 · 5.11` 레이트 리밋 표 — 읽기 300/분 · 쓰기 60/시간 · 아카이브 10/일 */
const LIMITS: Record<Scope, { limit: number; windowSeconds: number }> = {
  "resources:read": { limit: 300, windowSeconds: 60 },
  "resources:write": { limit: 60, windowSeconds: 3600 },
  "archive:run": { limit: 10, windowSeconds: 86_400 },
};

/**
 * 키를 확인하고 `Actor` 를 만들어 넘긴다.
 *
 * `scope` 가 `null` 이면 스코프를 안 봅니다 — `whoami` 만 그렇습니다.
 * 「내 키가 무엇을 할 수 있나」를 물으려고 스코프가 필요하면 답을 못 얻습니다.
 */
export function ingest(
  scope: Scope | null,
  fn: (ctx: IngestContext) => Promise<Response>
) {
  return async (req: Request): Promise<Response> => {
    try {
      const raw = bearer(req);
      if (!raw) {
        throw new AppError(
          "UNAUTHENTICATED",
          "API 키가 없습니다. Authorization: Bearer nw_live_… 헤더를 넣어 주세요."
        );
      }

      const verified = await verifyKey(raw);
      if (scope) assertScope(verified, scope);

      /*
       * **한도는 키마다.** 스코프별로 다른 이유는 비용이 다르기 때문입니다 —
       * 읽기는 싸고, 등록은 GitHub 수집을 부르고, 아카이브는 500MB 를 받습니다.
       */
      const l = LIMITS[scope ?? "resources:read"];
      const r = await consume(
        `rl:ingest:${verified.actor.apiKeyId}:${scope ?? "any"}`,
        l.limit,
        l.windowSeconds
      );
      if (!r.allowed) {
        return json(
          {
            error: {
              code: "RATE_LIMITED",
              message: `이 키의 한도를 넘었습니다. ${r.retryAfter}초 뒤에 다시 시도해 주세요.`,
            },
          },
          429,
          { "retry-after": String(r.retryAfter) }
        );
      }

      return await fn({
        actor: verified.actor,
        scopes: verified.scopes,
        req,
        url: new URL(req.url),
      });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

export function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return Response.json(body, { status, headers });
}

/**
 * `DEV-05 · 5.2` 의 오류 모양. **사람이 읽는 문구가 그대로 CLI 에 갑니다.**
 *
 * 상태 코드는 `lib/errors.ts` 의 `httpStatusOf` 가 냅니다. **여기에 표를 다시
 * 두지 않습니다** — 한 번 그렇게 했다가 `verifyKey` 가 실제로 던지는
 * `KEY_INVALID`·`KEY_REVOKED`·`KEY_EXPIRED` 세 개가 사본에 빠져 있어서,
 * **틀린 키가 401 이 아니라 500 «처리 중 문제가 발생했습니다»** 로 나갔습니다.
 * 에이전트는 그걸 보고 「서버가 아프다」고 판단해 재시도합니다 — 키를 고치지 않고.
 */
export function errorResponse(e: unknown): Response {
  if (e instanceof AppError) {
    return json(
      {
        error: {
          code: e.code,
          message: e.message,
          ...(e.fieldErrors ? { fieldErrors: e.fieldErrors } : {}),
        },
      },
      httpStatusOf(e.code)
    );
  }
  /*
   * **내부 오류를 그대로 내보내지 않습니다** (`NFR-SEC-016`).
   * 스택·SQL·경로가 나가면 안 되고, 에이전트에게도 쓸모가 없습니다.
   */
  console.error("[ingest]", e);
  return json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "처리 중 문제가 발생했습니다.",
      },
    },
    500
  );
}
