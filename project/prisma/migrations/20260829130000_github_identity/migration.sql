-- GitHub 저장소의 정체성을 `resources` 로 옮긴다 (DEC-050)
--
-- ## `github_repos(owner, repo)` 유니크는 «소프트 삭제를 볼 수 없습니다»
--
-- `DEC-047` 이 `url_normalized` 유니크를 내릴 수 있었던 이유는 `deleted_at` 이
-- **같은 테이블에** 있어 `WHERE deleted_at IS NULL` 로 술어를 걸 수 있었기
-- 때문입니다. **`github_repos` 에는 `deleted_at` 이 없습니다** — 소프트 삭제
-- 표시는 `resources` 에 있고, Postgres 의 인덱스 술어는 다른 테이블을 참조할
-- 수 없습니다.
--
-- 그래서 지금은 이렇게 됩니다:
--
--   저장소 A 등록 → 삭제(소프트) → A 를 다시 등록 → P2002
--   → 30일 뒤 CLEANUP_TRASH(P6) 가 돌 때까지 «영원히» 같습니다
--
-- `DEC-047` 이 고친 실패와 **같은 모양이 다른 문으로** 들어온 것입니다.
--
-- ## 「막는다」는 정책은 맞지만 이 제약이 그 정책을 지지하지 않습니다
--
-- * **아카이브 중복** — `FR-GH-003` 수용 기준에 「동일 SHA가 이미 있으면
--   재다운로드하지 않고 기존 것을 재사용한다」가 이미 있습니다. 중복 제거가
--   **SHA 수준**에서 규격화돼 있어 행 유일성이 필요하지 않습니다.
-- * **메타 갱신이 갈린다** — `jobs.resource_id` 로 걸려 있어 갈리지 않습니다.
--   두 행이면 두 job 이 각자 자기 행을 갱신합니다. 진짜 비용은 GitHub rate
--   limit 을 두 번 쓰는 것이고, 그건 워커가 `(owner, repo)` 로 묶을 일입니다.
--
-- 즉 이 유니크는 **정책보다 넓게 막고**(삭제된 것까지), 정책이 정말 필요한
-- 곳(job 중복)은 안 막습니다.
--
-- ## `DEC-047` 과 같은 조작, **다른 이유**
--
-- | | `DEC-047` (`url_normalized`) | `DEC-050` (여기) |
-- | --- | --- | --- |
-- | 왜 내리나 | **정책이 허용이라서** — 「그래도 등록」이 수용 기준 | **제약이 정책보다 넓어서** — 삭제된 것까지 막는다 |
-- | 뒤에 남는 정책 | 감지해서 보여주고 사람이 판단 | **여전히 막는다.** 자리를 `resources` 로 옮길 뿐 |
--
-- 이 구분이 흐려지면 다음 사람이 「유니크는 다 내리는 것」으로 읽습니다.

-- ── 1. 상세 테이블의 유니크를 일반 인덱스로 내린다 ──
DROP INDEX IF EXISTS "github_repos_owner_repo_key";
CREATE INDEX "github_repos_owner_repo_idx" ON "github_repos" ("owner", "repo");

-- ── 2. 정체성은 `resources` 위에서 표현한다 ──
--
-- 여기서는 부분 유니크가 **표현 가능합니다.** `url_normalized` 는
-- `normalizeUrl` 이 GitHub 주소를 `https://github.com/{owner}/{repo}` 로 접어
-- 만들므로(`/tree/main`·`/blob/…`·`.git` 이 전부 같은 값이 됩니다), 그 값이
-- 곧 저장소의 정체성입니다 — 지금의 URL 문자열 중복 감지보다 **오히려
-- 정확해집니다.** 그리고 소프트 삭제된 것은 다시 등록됩니다.
CREATE UNIQUE INDEX "idx_resources_github_url_unique"
  ON "resources" ("url_normalized")
  WHERE "deleted_at" IS NULL AND "type" = 'GITHUB_REPO';
