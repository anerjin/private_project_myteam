import "server-only";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { RepoFile } from "@/types";

/**
 * GitHub REST 클라이언트 (`FR-GH-001`·`002`).
 *
 * ## octokit 을 쓰지 않습니다
 *
 * 쓰는 것이 **저장소 조회·README·tarball 셋뿐**입니다. 그 셋에 의존성 하나와
 * 그 전이 의존성을 들이는 대신 `fetch` 로 씁니다 — `REQ-01 · 1.7` 의
 * 「유지보수 난이도가 낮은 구조를 우선한다」가 이런 자리에 적용됩니다.
 *
 * ## 토큰이 없어도 동작해야 합니다
 *
 * `GITHUB_TOKEN` 은 선택입니다(`env.ts`). 없으면 **시간당 60회**로 떨어지는데,
 * 공개 저장소 메타는 그대로 다 읽힙니다. 없는 상태를 «고장»으로 다루면
 * 토큰을 넣기 전까지 개발이 막힙니다 — 대신 **남은 횟수를 오류에 실어** 왜
 * 막혔는지 사람이 알게 합니다.
 *
 * ## rate limit 은 «언제 풀리는지»까지 말합니다
 *
 * GitHub 은 초과 시 `403`(또는 `429`)과 함께 `x-ratelimit-reset`(epoch 초)을
 * 줍니다. 「요청이 너무 많습니다」만 띄우면 사람이 계속 누릅니다.
 */

const API = "https://api.github.com";

/** GitHub 이 권장하는 버전 고정 — 응답 모양이 조용히 바뀌지 않게 */
const HEADERS = {
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
  "user-agent": "NeowaveWork",
};

export interface RepoMeta {
  owner: string;
  repo: string;
  description: string | null;
  defaultBranch: string;
  stars: number;
  forks: number;
  primaryLanguage: string | null;
  license: string | null;
  topics: string[];
  pushedAt: Date | null;
  latestRelease: string | null;
}

/** 저장소가 사라졌는가 — `FR-GH-007` 이 이 신호를 씁니다 */
export class RepoGoneError extends AppError {
  constructor(owner: string, repo: string) {
    super(
      "NOT_FOUND",
      `GitHub 에서 ${owner}/${repo} 를 찾을 수 없습니다. 삭제됐거나 비공개로 바뀌었을 수 있습니다.`
    );
  }
}

function authHeaders(): Record<string, string> {
  return env.GITHUB_TOKEN
    ? { ...HEADERS, authorization: `Bearer ${env.GITHUB_TOKEN}` }
    : HEADERS;
}

/**
 * 응답을 «해석»합니다. 성공이면 그대로, 아니면 **할 수 있는 일이 있는 문구**로.
 */
async function ensureOk(res: Response, owner: string, repo: string) {
  if (res.ok) return;

  if (res.status === 404) throw new RepoGoneError(owner, repo);

  const remaining = res.headers.get("x-ratelimit-remaining");
  const reset = Number(res.headers.get("x-ratelimit-reset") ?? 0);
  if ((res.status === 403 || res.status === 429) && remaining === "0") {
    const waitSec = Math.max(0, reset * 1000 - Date.now()) / 1000;
    const mins = Math.ceil(waitSec / 60);
    throw new AppError(
      "RATE_LIMITED",
      env.GITHUB_TOKEN
        ? `GitHub API 한도를 다 썼습니다. 약 ${mins}분 뒤에 다시 됩니다.`
        : `GitHub API 한도를 다 썼습니다(토큰 없이 시간당 60회). 약 ${mins}분 뒤에 다시 되고, GITHUB_TOKEN 을 넣으면 5,000회가 됩니다.`
    );
  }

  throw new AppError(
    "UPSTREAM_ERROR",
    `GitHub 응답이 정상이 아닙니다 (HTTP ${res.status}).`
  );
}

/** 저장소 메타 (`FR-GH-001`) */
export async function fetchRepoMeta(
  owner: string,
  repo: string
): Promise<RepoMeta> {
  const res = await fetch(`${API}/repos/${owner}/${repo}`, {
    headers: authHeaders(),
    // 자체 캐시를 켜면 「갱신」 버튼이 옛 값을 다시 보여줍니다
    cache: "no-store",
  });
  await ensureOk(res, owner, repo);

  const d = (await res.json()) as {
    name: string;
    owner: { login: string };
    description: string | null;
    default_branch: string;
    stargazers_count: number;
    forks_count: number;
    language: string | null;
    license: { spdx_id?: string; name?: string } | null;
    topics?: string[];
    pushed_at: string | null;
  };

  return {
    // **응답의 대소문자를 씁니다** — 사용자가 소문자로 적어도 정식 표기로 저장
    owner: d.owner.login,
    repo: d.name,
    description: d.description,
    defaultBranch: d.default_branch,
    stars: d.stargazers_count,
    forks: d.forks_count,
    primaryLanguage: d.language,
    license: d.license?.spdx_id ?? d.license?.name ?? null,
    topics: d.topics ?? [],
    pushedAt: d.pushed_at ? new Date(d.pushed_at) : null,
    /*
     * **토큰이 없으면 릴리스를 안 받습니다.**
     *
     * 자료 1건 등록에 저장소 조회 + 릴리스 + README = **3회**를 씁니다.
     * 비인증은 시간당 60회이므로 **20건**이 상한이고, `P7` 의 CLI 가
     * 「찾아서 등록해줘」로 여러 건을 밀어 넣는 순간 첫 배치에서 한도를 칩니다.
     *
     * 릴리스 태그는 `FR-GH-006`(**P1**)이고 저장소 메타·README 는 `P0` 입니다.
     * 예산이 빠듯할 때 **P0 를 지키는 쪽**으로 씁니다 — 토큰을 넣으면
     * 5,000회가 되어 자동으로 다시 받습니다.
     */
    latestRelease: env.GITHUB_TOKEN
      ? await fetchLatestRelease(owner, repo)
      : null,
  };
}

/**
 * 최신 릴리스 태그 (`FR-GH-006`).
 *
 * **릴리스가 없는 저장소가 많습니다.** 404 를 오류로 올리면 메타 수집 전체가
 * 실패하므로 여기서만 `null` 로 삼킵니다 — 「없다」와 「못 읽었다」를 구별해야
 * 하는 자리가 아닙니다.
 */
async function fetchLatestRelease(
  owner: string,
  repo: string
): Promise<string | null> {
  try {
    const res = await fetch(`${API}/repos/${owner}/${repo}/releases/latest`, {
      headers: authHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { tag_name?: string };
    return d.tag_name ?? null;
  } catch {
    return null;
  }
}

/**
 * README 원문 (`FR-GH-002`).
 *
 * `Accept: application/vnd.github.raw` 로 **마크다운 그대로** 받습니다 —
 * 기본 응답은 base64 JSON 이라 한 번 더 디코드해야 하고, 그 과정에서
 * 인코딩이 틀어질 자리가 생깁니다.
 *
 * 없으면 `null` 입니다. README 가 없는 저장소는 흔합니다.
 */
export async function fetchReadme(
  owner: string,
  repo: string
): Promise<string | null> {
  const res = await fetch(`${API}/repos/${owner}/${repo}/readme`, {
    headers: { ...authHeaders(), accept: "application/vnd.github.raw" },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  await ensureOk(res, owner, repo);
  const text = await res.text();
  // 상세 화면이 렌더하므로 상한을 둡니다 — 거대한 README 가 페이로드를 먹습니다
  return text.length > 200_000 ? text.slice(0, 200_000) : text;
}

/**
 * 최상위 파일·폴더 목록.
 *
 * 상세 화면이 **GitHub 첫 화면처럼** 그립니다. 그리고 원본이 사라진 뒤에도
 * 「무엇이 들어 있던 저장소인가」가 남습니다(`REQ-01 · 1.1`) — 지금까지는
 * 그때 요약·README 밖에 없었습니다.
 *
 * ## 전체 트리를 안 받는 이유
 *
 * `git/trees?recursive=1` 한 번이면 전부 오지만 저장소 하나가 **1만 줄**이
 * 넘습니다(GDAL). 저장해 두면 상세 화면이 매번 그만큼을 실어 보냅니다 —
 * 열어 보지도 않을 것을요. GitHub 도 첫 화면에는 최상위만 보여 줍니다.
 *
 * 없거나 못 읽으면 `null` 입니다. **메타 수집 전체를 실패시키지 않습니다** —
 * 파일 목록은 있으면 좋은 것이지 `P0` 가 아닙니다.
 */
export async function fetchRootFiles(
  owner: string,
  repo: string
): Promise<RepoFile[] | null> {
  try {
    const res = await fetch(`${API}/repos/${owner}/${repo}/contents/`, {
      headers: authHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as unknown;
    // 빈 저장소는 배열이 아니라 오류 객체를 줍니다
    if (!Array.isArray(rows)) return null;

    const files = rows
      .filter(
        (r): r is { name: string; type: string; size?: number } =>
          typeof (r as { name?: unknown }).name === "string"
      )
      .map((r) => ({
        name: r.name,
        // `submodule`·`symlink` 도 옵니다 — 파일로 봅니다
        type: r.type === "dir" ? ("dir" as const) : ("file" as const),
        size: r.type === "dir" ? undefined : (r.size ?? 0),
      }));

    /*
     * **폴더 먼저, 그다음 이름순** — GitHub 과 같은 순서입니다. 화면에서
     * 정렬하지 않고 여기서 굳혀 둡니다: 저장된 값이 이미 보여 줄 순서면
     * 그리는 쪽이 그 규칙을 몰라도 됩니다.
     */
    files.sort((a, b) =>
      a.type === b.type
        ? a.name.localeCompare(b.name)
        : a.type === "dir"
          ? -1
          : 1
    );
    return files;
  } catch {
    return null;
  }
}

/** 아카이브 tarball 주소 — 워커가 스트리밍으로 받습니다 (`FR-GH-003`) */
export function tarballUrl(owner: string, repo: string, ref: string): string {
  return `${API}/repos/${owner}/${repo}/tarball/${ref}`;
}

export function githubHeaders(): Record<string, string> {
  return authHeaders();
}

/** 남은 호출 수 — 관리자 화면과 오류 문구가 씁니다 (`FR-GH-008` 의 조회 쪽) */
export async function rateLimit(): Promise<{
  remaining: number;
  limit: number;
  resetAt: Date;
}> {
  const res = await fetch(`${API}/rate_limit`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  const d = (await res.json()) as {
    rate: { remaining: number; limit: number; reset: number };
  };
  return {
    remaining: d.rate.remaining,
    limit: d.rate.limit,
    resetAt: new Date(d.rate.reset * 1000),
  };
}
