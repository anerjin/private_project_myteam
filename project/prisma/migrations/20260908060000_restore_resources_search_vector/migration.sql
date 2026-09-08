-- ═══════════════════════════════════════════════════════════════════
-- `20260908051503_project_task_color_and_comments` 가 **지운 것을 되돌립니다.**
--
-- ## 무슨 일이 있었나
--
-- `search_vector` 는 `init` 이 **raw SQL 로만** 만든 컬럼입니다 — `schema.prisma`
-- 에 없습니다(`tsvector` 를 Prisma 가 표현하지 못합니다). 그래서
-- `prisma migrate dev` 는 그 컬럼을 **드리프트로 보고 지우는 마이그레이션을
-- 생성**합니다. `init` 이 「스키마를 바꿔 마이그레이션을 다시 만들 때 이 블록을
-- 옮겨 붙이는 것을 잊지 마세요」라고 적어 둔 것이 바로 이 함정이고,
-- 바로 앞 마이그레이션(`20260904110000_projects`)은 그 줄을 주석 처리해
-- 넘겼습니다. 이번에는 그러지 못했습니다.
--
-- ## 왜 조용히 안 드러났나
--
-- **트리거는 남고 컬럼만 사라집니다.** `trg_resources_search` 가 여전히
-- `NEW."search_vector"` 에 쓰려 하므로 `resources` 로의 **모든 INSERT/UPDATE 가
-- `42703` 로 죽습니다** — 「자료 등록」이 통째로 멎습니다. 화면에는 저장 실패로만
-- 보이고, 원인은 이름조차 안 나옵니다(`(not available)`).
--
-- ## 되돌리지 않는 것 하나
--
-- 같은 마이그레이션이 `github_repos.file_tree` 를 `JSON` → `JSONB` 로 바꿨습니다.
-- **그건 그대로 둡니다** — `schema.prisma` 의 `Json?` 은 Prisma 가 `jsonb` 로
-- 매핑하는 타입이라, `JSON` 으로 되돌리면 앞으로 **매번** 같은 ALTER 가 다시
-- 생성됩니다. 행이 0건이라 손실도 없습니다. 드리프트를 없애는 쪽이 맞습니다.
-- ═══════════════════════════════════════════════════════════════════

-- ── 컬럼 ─────────────────────────────────────────────────────────
ALTER TABLE "resources" ADD COLUMN IF NOT EXISTS "search_vector" tsvector;

-- ── 인덱스 (init 과 같은 이름·같은 정의) ──────────────────────────
CREATE INDEX IF NOT EXISTS "idx_resources_search"
  ON "resources" USING GIN ("search_vector");
CREATE INDEX IF NOT EXISTS "idx_resources_title_trgm"
  ON "resources" USING GIN ("title" gin_trgm_ops);

-- ── 이미 있던 행 채우기 ───────────────────────────────────────────
-- 트리거는 INSERT/UPDATE 때만 돕니다. 컬럼이 없는 동안 들어온 행은 없지만
-- (INSERT 자체가 죽었으므로), 그 전부터 있던 행은 값이 비어 있습니다.
UPDATE "resources" SET "search_vector" =
     setweight(to_tsvector('simple', unaccent(coalesce("title", ''))),   'A')
  || setweight(to_tsvector('simple', unaccent(coalesce("summary", ''))), 'B')
  || setweight(to_tsvector('simple', unaccent(coalesce("body", ''))),    'C')
WHERE "search_vector" IS NULL;
