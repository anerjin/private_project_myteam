import { z } from "zod";

/**
 * `GITHUB_REPO` 입력 스키마 (`REQ-04 · CT-GITHUB_REPO`, `FR-TYPE-005`).
 *
 * ## **사람이 적는 칸이 없습니다.** URL 하나에서 나옵니다
 *
 * 폼이 「추가 입력이 필요 없습니다 — 스타·라이선스·언어·README 는 서버가
 * GitHub API 로 채웁니다」라고 말합니다. 그 안내가 참이려면 여기에
 * 「사람이 적는 필드」를 두면 안 됩니다.
 *
 * `owner`·`repo` 는 **URL 에서 파싱합니다.** 상세 스키마는 공통 스키마와
 * **같은 `raw`** 를 받으므로(`form.schema.parseResourceInput`) `url` 을 그대로
 * 읽을 수 있습니다 — 따로 넘겨 줄 배선이 필요 없습니다.
 *
 * ## URL 이 **필수**인 유일한 타입입니다
 *
 * 다른 타입은 URL 없이도 자료가 됩니다(본문만 적어도 됩니다). GitHub 저장소는
 * URL 이 곧 **정체성**이라 없으면 무엇을 가리키는지 알 수 없습니다.
 * 그리고 그 정체성이 `DEC-050` 의 중복 판정 근거이기도 합니다.
 */

/** `github.com/{owner}/{repo}` — 뒤에 `/tree/main` 같은 게 붙어도 같은 저장소다 */
const GITHUB_PATH =
  /^\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38})?)\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?(?:\/.*)?$/;

export interface GithubRef {
  owner: string;
  repo: string;
}

/** URL 에서 `owner`/`repo` 를 뽑는다. GitHub 저장소 주소가 아니면 `null` */
export function parseGithubUrl(raw: string | undefined): GithubRef | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "github.com") return null;

  const m = GITHUB_PATH.exec(u.pathname);
  if (!m) return null;
  const [, owner, repo] = m;
  // `/settings` 같은 예약 경로가 owner 로 잡히지 않게
  if (RESERVED_OWNERS.has(owner.toLowerCase())) return null;
  return { owner, repo };
}

/** GitHub 이 계정으로 쓸 수 없게 잡아 둔 최상위 경로 */
const RESERVED_OWNERS = new Set([
  "settings",
  "features",
  "explore",
  "marketplace",
  "notifications",
  "pulls",
  "issues",
  "orgs",
  "sponsors",
  "topics",
  "collections",
  "trending",
  "about",
  "pricing",
]);

/**
 * **입력에서 «만드는» 스키마입니다.** 다른 타입은 사용자가 적은 칸을 검증하지만
 * 여기서는 `url` 하나를 읽어 `{ owner, repo }` 를 만들어 냅니다.
 */
export const githubRepoSchema = z
  .object({ url: z.string().trim().optional() })
  .transform((v, ctx) => {
    const ref = parseGithubUrl(v.url);
    if (!ref) {
      ctx.addIssue({
        code: "custom",
        path: ["url"],
        message:
          "GitHub 저장소 주소를 적어 주세요. (예: https://github.com/owner/repo)",
      });
      return z.NEVER;
    }
    return ref;
  });

export type GithubRepoInput = z.infer<typeof githubRepoSchema>;
