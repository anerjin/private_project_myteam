-- url_normalized 의 유니크를 일반 인덱스로 내린다 (DEC-047).
--
-- FR-RES-011 수용 기준이 「이동 / **그래도 등록** 중 선택하게 한다」인데
-- DB 가 두 번째 선택지를 막고 있었다. 화면은 「그대로 등록해도 됩니다」라는
-- 배너까지 띄우고, 누르면 P2002 가 INTERNAL_ERROR 로 삼켜져
-- 「처리 중 문제가 발생했습니다」가 떴다 — 다시 시도해도 영원히 같다.
--
-- 이 유니크는 DEC 으로 검토된 적이 없다. REQ-04 · 4.2 컬럼 표의 괄호 주석
-- 「(유니크 인덱스)」가 DEV-02 를 거쳐 SQL 이 된 것이고, 원래 마이그레이션 주석도
-- WHERE deleted_at IS NULL 만 설명하고 UNIQUE 자체는 설명하지 않는다.
--
-- 중복 정책은 진입점마다 다르므로(웹=허용 · MCP=409, DEV-05 API-104)
-- 한 DB 제약이 두 정책을 낼 수 없다. 정책은 진입점에 둔다.
-- 인덱스는 findByUrl 조회를 위해 남긴다.

DROP INDEX IF EXISTS "idx_resources_url_unique";

CREATE INDEX "idx_resources_url_normalized" ON "resources"("url_normalized")
  WHERE "deleted_at" IS NULL AND "url_normalized" IS NOT NULL;
