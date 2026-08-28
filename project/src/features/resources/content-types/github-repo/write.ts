import type { GithubRepoInput } from "@/features/resources/content-types/github-repo/schema";

/**
 * `GITHUB_REPO` — zod 출력 → 상세 테이블 행.
 *
 * ## **기계가 채우는 칸을 건드리지 않습니다**
 *
 * `stars`·`license`·`topics`·`readme_content`·`archive_*` 는 `P6` 의 GitHub
 * 수집 워커가 채웁니다. 여기서 `null` 이나 `[]` 로 내보내면 **사람이 제목을
 * 고칠 때마다 수집해 둔 메타가 지워집니다** — `upsert.update` 가 그 값을 씁니다.
 *
 * > 다른 다섯 타입은 「`undefined` 를 `null` 로 바꾸는 것」이 본체인데
 * > 여기서는 **아예 내보내지 않는 것**이 본체입니다. 규칙이 뒤집힌 게 아니라
 * > 같은 규칙입니다 — **사용자가 소유한 칸만 쓴다.**
 *
 * `topics` 는 `TEXT[]` 이고 `NOT NULL` 이 아니라 등록 때 빼도 됩니다.
 */
export function toRow(input: GithubRepoInput) {
  return {
    owner: input.owner,
    repo: input.repo,
  };
}
