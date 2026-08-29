import { ingest, json } from "@/app/api/ingest/_lib/handler";

/**
 * API-108 `whoami` — 키 소유자·역할·스코프 (설정 점검용).
 *
 * **스코프를 안 봅니다.** 「내 키가 무엇을 할 수 있나」를 물으려고 스코프가
 * 필요하면 답을 못 얻습니다 — MCP 서버가 기동할 때 처음 부르는 것이 이것이고,
 * 여기서 막히면 사용자는 무엇이 잘못됐는지 알 수 없습니다.
 */
export const GET = ingest(null, async ({ actor, scopes }) =>
  json({
    data: {
      username: actor.username,
      role: actor.role,
      /*
       * **키에 적힌 것이 아니라 «지금 행사할 수 있는» 스코프**입니다
       * (`DEC-037`). 역할이 내려가면 키를 안 고쳐도 좁아집니다 —
       * 그래서 화면에서 본 것과 다를 수 있고, **이 값이 사실**입니다.
       */
      scopes,
      via: actor.via,
    },
  })
);
