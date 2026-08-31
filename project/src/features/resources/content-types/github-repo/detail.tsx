import { AlertTriangle, GitFork, Star } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card as UICard,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DetailRow } from "@/features/resources/components/detail-row";
import type { Resource } from "@/types";

/**
 * 왼쪽 본문 — **저장소 상태 안내만** 합니다.
 *
 * 파일 목록과 README 는 상세 화면이 그립니다(`RepoBrowser`). 그 둘은 DB 를
 * 한 번 더 읽어야 하는데, 타입 폴더는 **화면 컴포넌트와 같은 자리**라
 * 서비스를 부르지 않습니다 (`check-deps` 가 `@prisma/client` 를 막는 것과
 * 같은 정신입니다).
 *
 * 「저장소 정보」와 「소스 아카이브」는 **오른쪽으로 갔습니다**(`aside.tsx`).
 * 스타·언어·라이선스는 곁다리이고, 본문 자리는 README 의 것입니다.
 */
export function Detail({ resource }: { resource: Resource }) {
  const d = resource.detail;
  if (d.type !== "GITHUB_REPO") return null;
  if (!d.isGone) return null;

  /*
   * **「못 읽었다」와 「사라졌다」는 다른 사실입니다.**
   *
   * `isGone` 은 GitHub 이 404 를 준 것뿐이고, 그 안에는 세 가지가 섞여
   * 있습니다: 삭제됨 · 비공개로 바뀜 · **처음부터 못 읽음**(비공개이거나
   * 아직 없는 주소).
   *
   * 전에는 전부 「원본이 사라졌습니다 … 아래 아카이브를 이용하세요」라고
   * 했습니다. 한 번도 읽은 적 없는 저장소에는 **거짓**이고, 아카이브가
   * 없을 때는 **없는 것을 가리킵니다.** 사내 저장소를 등록한 운영자가
   * 정확히 그 화면을 봤습니다.
   *
   * 가르는 신호는 **메타를 한 번이라도 받았는가**입니다 — 받았으면
   * `stars` 가 있습니다.
   */
  return (
    <Alert variant="destructive">
      <AlertTriangle />
      {d.stars === undefined ? (
        <>
          <AlertTitle>이 저장소를 읽지 못했습니다</AlertTitle>
          <AlertDescription>
            한 번도 읽은 적이 없습니다 — <b>비공개이거나 아직 없는 주소</b>
            입니다. 비공개 저장소는 관리자가 GitHub 토큰을 넣어야 읽을 수
            있습니다. 주소가 맞는지도 함께 확인해 보세요.
          </AlertDescription>
        </>
      ) : (
        <>
          <AlertTitle>원본이 사라졌습니다</AlertTitle>
          <AlertDescription>
            저장소가 삭제되었거나 비공개로 전환되었습니다.
            {d.archiveStatus === "DONE"
              ? " 보관해 둔 아카이브로 소스를 받을 수 있습니다."
              : " 아카이브를 받아 둔 적이 없어 요약·README 만 남아 있습니다."}
          </AlertDescription>
        </>
      )}
    </Alert>
  );
}

/**
 * 오른쪽 열 — **저장소 정보** (`FR-TYPE-003`).
 *
 * 왼쪽에 있던 것을 그대로 옮긴 것이 아닙니다. 전에는 여기 「소스 아카이브」
 * 카드가 함께 있었는데 그 카드의 버튼 셋(`다시 받기`·`다운로드`·`아카이브
 * 실행`)에 **`onClick` 이 없었습니다** — 서버 컴포넌트라 있을 수도 없었고,
 * 누르면 아무 일도 일어나지 않았습니다. 실제로 도는 버튼은 `GithubPanel`
 * 에 있었고 같은 화면에 **둘이 나란히** 있었습니다.
 *
 * 아카이브 이야기는 `GithubPanel` 한 곳으로 모았습니다.
 */
export function Aside({ resource }: { resource: Resource }) {
  const d = resource.detail;
  if (d.type !== "GITHUB_REPO") return null;

  return (
    <UICard>
      <CardHeader>
        <CardTitle className="text-base">저장소 정보</CardTitle>
      </CardHeader>
      <CardContent>
        {/*
          **못 받았으면 숫자를 안 그립니다.** `undefined?.toLocaleString()` 은
          빈칸이 되어 별 아이콘 옆에 아무것도 없는 자리가 남습니다 — 「0개」로도
          「모름」으로도 안 읽힙니다.
        */}
        {d.stars !== undefined && (
          <div className="mb-4 flex flex-wrap gap-4 text-sm">
            <span className="inline-flex items-center gap-1.5">
              <Star className="size-4 text-amber-500" />
              <b className="tabular-nums">{d.stars.toLocaleString()}</b>
            </span>
            {d.forks !== undefined && (
              <span className="inline-flex items-center gap-1.5">
                <GitFork className="text-muted-foreground size-4" />
                <b className="tabular-nums">{d.forks.toLocaleString()}</b>
              </span>
            )}
          </div>
        )}
        <dl className="divide-y">
          <DetailRow label="소유자 / 저장소" value={`${d.owner} / ${d.repo}`} />
          <DetailRow label="기본 브랜치" value={d.defaultBranch ?? "-"} />
          <DetailRow label="주 언어" value={d.primaryLanguage ?? "-"} />
          <DetailRow label="라이선스" value={d.license ?? "확인 필요"} />
          <DetailRow label="토픽" value={d.topics?.join(", ") ?? "-"} />
          <DetailRow label="최근 커밋" value={d.pushedAt?.slice(0, 10) ?? "-"} />
          <DetailRow label="최신 릴리스" value={d.latestRelease ?? "-"} />
        </dl>
      </CardContent>
    </UICard>
  );
}
