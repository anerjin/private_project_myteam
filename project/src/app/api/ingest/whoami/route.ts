import { ingest, json } from "@/app/api/ingest/_lib/handler";

/**
 * API-108 `whoami` — 키 소유자·스코프 (설정 점검용).
 *
 * 🔄 `role` 을 함께 돌려줬습니다. `DEC-077` 로 사람의 등급이 사라져 **응답에서
 *    뺐습니다** — 「이 키가 무엇을 할 수 있나」의 답은 이제 `scopes` 하나입니다.
 *
 * **스코프를 안 봅니다.** 「내 키가 무엇을 할 수 있나」를 물으려고 스코프가
 * 필요하면 답을 못 얻습니다 — MCP 서버가 기동할 때 처음 부르는 것이 이것이고,
 * 여기서 막히면 사용자는 무엇이 잘못됐는지 알 수 없습니다.
 */
export const GET = ingest(null, async ({ actor, scopes }) =>
  json({
    data: {
      username: actor.username,
      /*
       * **키에 적힌 것이 아니라 «지금 행사할 수 있는» 스코프**입니다
       * (`DEC-037`). 목록에서 없어진 스코프는 키를 안 고쳐도 빠집니다 —
       * 그래서 화면에서 본 것과 다를 수 있고, **이 값이 사실**입니다.
       */
      scopes,
      via: actor.via,
    },
  })
);
