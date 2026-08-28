-- 목록·상세 질의 인덱스 (P5 · DEC-052)
--
-- ## 「빠른가」가 아니라 「무엇을 하고 있는가」로 골랐습니다
--
-- 1만 건에서는 전부 500ms 안입니다. 그 기준만 보면 인덱스를 하나도 안 넣게
-- 되고, 25만 건을 만드는 것은 `P7` 의 에이전트 수집이라 **신호가 도착할 때는
-- 이미 늦습니다.** 그렇다고 「인덱스를 안 탄다」로 고르면 오탐이 납니다 —
-- 1만 행에서 Postgres 는 «일부러» 순차 스캔을 고르고 그게 옳은 판단입니다.
--
-- 기준: **출력이 `LIMIT 24` 로 묶여 있는데 어느 노드가 «읽는 행 수가 N 에
-- 비례»하는가.** 그리고 1만/10만 두 크기에서 재 확증했습니다.
--
-- | 축 | 1만 | 10만 | 비 | 판정 |
-- | --- | ---: | ---: | ---: | --- |
-- | 타입 필터 | 4ms | 4ms | 1.0 | 인덱스 있음 — 대조군 |
-- | 북마크 목록 | 5ms | 5ms | 1.0 | 인덱스 있음 — 대조군 |
-- | 정렬 4축 | 8~9ms | 27ms | 3.4 | `Seq Scan + Sort` — 받는다 |
-- | 태그 필터 | 10ms | 57ms | 5.7 | 탈 인덱스가 없다 — 받는다 |
-- | 관련 자료 | 11ms | **164ms** | **15** | 같은 원인 — 받는다 |
-- | `count` | 2ms | 22ms | 11 | 오프셋의 본질. 인덱스로 못 고친다 |
--
-- **대조군이 1.0 으로 나온 것이 이 방법이 작동한다는 증거입니다** —
-- 모든 축이 자랐다면 측정이 아니라 잡음을 본 것입니다.

-- ── 1. resource_tags 를 tag_id 로 타는 길 ──
--
-- PK 가 `(resource_id, tag_id)` 라 **`tag_id` 로 시작하는 인덱스가 없었습니다.**
-- 「인덱스를 안 탄다」가 아니라 **탈 인덱스가 없는** 경우이고, 그래서 태그
-- 필터와 `findRelated`(상세 화면의 관련 자료)가 매번 연결 테이블 전체를
-- 훑었습니다. 10만 건에서 상세 화면이 164ms 를 여기에 씁니다
-- (`NFR-PERF-004` 상세 700ms 의 4분의 1).
--
-- `resource_id` 를 함께 넣어 **커버링**으로 만듭니다 — 연결만 보고 끝나면
-- 힙을 안 봅니다.
CREATE INDEX "resource_tags_tag_id_resource_id_idx"
  ON "resource_tags" ("tag_id", "resource_id");

-- ── 2. 정렬 4축 (부분 인덱스) ──
--
-- 탐색 목록은 **항상** `deleted_at IS NULL AND status = 'PUBLISHED'` 로
-- 좁힙니다(`toWhere`). 그래서 부분 인덱스가 정확히 들어맞고, 초안·휴지통
-- 행이 인덱스에 안 들어가 크기도 작습니다.
--
-- `id` 를 타이브레이커로 함께 넣습니다 — `orderByFor` 가 축과 `id` 를 **같은
-- 방향으로** 뒤집으므로, `dir=asc` 는 같은 인덱스를 **거꾸로 훑어** 씁니다.
-- 방향마다 인덱스를 만들 필요가 없습니다.
CREATE INDEX "resources_live_recent_idx"
  ON "resources" ("created_at" DESC, "id" DESC)
  WHERE "deleted_at" IS NULL AND "status" = 'PUBLISHED';

CREATE INDEX "resources_live_popular_idx"
  ON "resources" ("view_count" DESC, "id" DESC)
  WHERE "deleted_at" IS NULL AND "status" = 'PUBLISHED';

CREATE INDEX "resources_live_bookmarked_idx"
  ON "resources" ("bookmark_count" DESC, "id" DESC)
  WHERE "deleted_at" IS NULL AND "status" = 'PUBLISHED';

CREATE INDEX "resources_live_title_idx"
  ON "resources" ("title" ASC, "id" ASC)
  WHERE "deleted_at" IS NULL AND "status" = 'PUBLISHED';

-- ── 만들지 «않은» 것도 남깁니다 ──
--
-- 다음 사람이 다시 묻지 않도록. 「필요할 것 같아서 만들어 둔 것」이 이
-- 저장소에 넷 있었고 **넷 다 틀렸습니다**(`MemberFilter`·`check-deps` 규칙·
-- `effectiveScopes`·`scopesAllowedFor`).
--
-- * **`count(*)` 용 인덱스** — 없습니다. 조건에 맞는 «전부»를 세는 일이라
--   인덱스로 줄지 않습니다. 10만에서 22ms 이고 오프셋 경로에만 듭니다.
--   커지면 근사 개수(`reltuples`)나 「1000+ 건」 표기로 갑니다.
-- * **`deleted_at` 단독 인덱스** — 위 부분 인덱스의 술어가 그 일을 겸합니다.
-- * **`(status)` 단독** — 이미 있습니다(`resources_status_idx`). 값이 셋뿐이라
--   선택도가 낮아 단독으로는 거의 안 쓰이지만, 관리 화면의 상태 탭이 씁니다.
-- * **`tags.usage_count`** — 「인기 태그」가 1ms 입니다(태그 수가 적음).
--   `FR-ADM-013`(태그 정리)이 수천 개를 만들면 그때 봅니다.
