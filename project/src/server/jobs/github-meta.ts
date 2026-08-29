import "server-only";

import { fetchReadme, fetchRepoMeta, RepoGoneError } from "@/lib/github";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { register } from "@/server/services/job.service";

/**
 * GitHub 저장소 메타 수집 (`FR-GH-001`·`002`).
 *
 * ## **사람이 적은 것을 덮지 않습니다**
 *
 * 제목·요약·본문은 사용자 것이고, 스타·언어·라이선스·토픽·README 는 기계 것입니다.
 * 이 처리기는 **기계 칸만** 씁니다 — 그래서 등록 뒤 제목을 고쳐도 다음 갱신에
 * 되돌아가지 않습니다 (`github-repo/write.ts` 가 반대 방향으로 같은 규칙을 지킵니다).
 *
 * `description` 만 예외적으로 **비어 있을 때만** 요약에 채웁니다 — 「URL 하나로
 * 등록하면 메타가 자동으로 채워진다」(`REQ-01 · 1.2`)가 그 뜻이고, 이미 적은
 * 요약이 있으면 건드리지 않습니다.
 */
async function run(job: { resourceId: string | null }) {
  if (!job.resourceId) {
    throw new AppError("INVALID_STATE", "대상 자료가 없는 작업입니다.");
  }

  const detail = await db.githubRepo.findUnique({
    where: { resourceId: job.resourceId },
    select: { owner: true, repo: true },
  });
  if (!detail) {
    throw new AppError(
      "NOT_FOUND",
      "GitHub 상세 행이 없습니다. 자료가 지워졌거나 타입이 다릅니다."
    );
  }

  let meta;
  try {
    meta = await fetchRepoMeta(detail.owner, detail.repo);
  } catch (e) {
    /*
     * **원본 소실 감지** (`FR-GH-007`).
     *
     * `is_gone` 컬럼이 있는데 **아무도 `true` 로 만들지 않고 있었습니다** —
     * 성공했을 때 `false` 로 되돌리기만 했습니다. 그러면 그 컬럼은 「아직
     * 확인 안 함」과 「살아 있음」을 구별하지 못하는 상수가 됩니다.
     *
     * 저장소가 사라진 것은 **작업 실패이면서 동시에 알아야 할 사실**입니다.
     * 그래서 표시를 남기고 오류는 그대로 올립니다 — 화면이 「원본이 사라졌으니
     * 아카이브를 쓰세요」라고 말할 수 있게 됩니다.
     */
    if (e instanceof RepoGoneError) {
      await db.githubRepo.update({
        where: { resourceId: job.resourceId },
        data: { isGone: true },
      });
    }
    throw e;
  }

  const readme = await fetchReadme(meta.owner, meta.repo);

  await db.$transaction(async (tx) => {
    await tx.githubRepo.update({
      where: { resourceId: job.resourceId! },
      data: {
        // 정식 표기로 맞춘다 — 사용자가 소문자로 적었어도
        owner: meta.owner,
        repo: meta.repo,
        defaultBranch: meta.defaultBranch,
        stars: meta.stars,
        forks: meta.forks,
        primaryLanguage: meta.primaryLanguage,
        license: meta.license,
        topics: meta.topics,
        pushedAt: meta.pushedAt,
        latestRelease: meta.latestRelease,
        readmeContent: readme,
        readmeFetchedAt: readme ? new Date() : null,
        // 읽혔다는 것은 살아 있다는 뜻 (`FR-GH-007`)
        isGone: false,
      },
    });

    if (meta.description) {
      /*
       * **비어 있을 때만** 채웁니다. `updateMany` 의 `where` 로 조건을 걸면
       * 「읽고 판단해서 쓴다」의 경합이 없습니다 — 이 저장소가 카운터에서
       * 겪은 것과 같은 형태입니다.
       */
      await tx.resource.updateMany({
        where: { id: job.resourceId!, OR: [{ summary: null }, { summary: "" }] },
        data: { summary: meta.description.slice(0, 300) },
      });
    }
  });

  return {
    stars: meta.stars,
    readme: readme ? readme.length : 0,
    license: meta.license,
  };
}

register("FETCH_GITHUB_META", run);
register("REFRESH_GITHUB_META", run);
