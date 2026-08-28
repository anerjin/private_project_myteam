-- API 키 식별자를 key_prefix 에서 key_hash 로 옮긴다.
--
-- 키를 «식별»하는 것은 key_hash 인데 유니크는 key_prefix(48비트) 쪽에 있었다.
-- 그래서 verifyKey 가 findFirst + 인덱스 없음 = 매 요청 전체 스캔이었고
-- (P7 Ingest 인증 핫패스가 여기 하나다), key_prefix 유니크는 식별에 쓰이지도
-- 않으면서 발급이 유니크 위반으로 실패할 경로만 만들었다.

DROP INDEX IF EXISTS "api_keys_key_prefix_key";

CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");
