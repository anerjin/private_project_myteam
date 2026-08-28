import {
  AlertTriangle,
  Archive,
  Download,
  GitFork,
  RefreshCw,
  Star,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card as UICard,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DetailRow } from "@/features/resources/components/detail-row";
import type { Resource } from "@/types";

export function Detail({ resource }: { resource: Resource }) {
  const d = resource.detail;
  if (d.type !== "GITHUB_REPO") return null;

  return (
    <div className="space-y-4">
      {d.isGone && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>원본이 사라졌습니다</AlertTitle>
          <AlertDescription>
            저장소가 삭제되었거나 비공개로 전환되었습니다. 아래 아카이브를 이용하세요.
          </AlertDescription>
        </Alert>
      )}

      <UICard>
        <CardHeader>
          <CardTitle className="text-base">저장소 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap gap-4 text-sm">
            <span className="inline-flex items-center gap-1.5">
              <Star className="size-4 text-amber-500" />
              <b className="tabular-nums">{d.stars?.toLocaleString()}</b>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <GitFork className="text-muted-foreground size-4" />
              <b className="tabular-nums">{d.forks?.toLocaleString()}</b>
            </span>
          </div>
          <dl className="divide-y">
            <DetailRow label="소유자 / 저장소" value={`${d.owner} / ${d.repo}`} />
            <DetailRow label="주 언어" value={d.primaryLanguage ?? "-"} />
            <DetailRow label="라이선스" value={d.license ?? "확인 필요"} />
            <DetailRow label="토픽" value={d.topics?.join(", ") ?? "-"} />
            <DetailRow label="최근 커밋" value={d.pushedAt ?? "-"} />
            <DetailRow label="최신 릴리스" value={d.latestRelease ?? "-"} />
          </dl>
        </CardContent>
      </UICard>

      <UICard>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Archive className="size-4" />
            소스 아카이브
          </CardTitle>
          <CardDescription>
            원본이 사라져도 남도록 사내 디스크에 보관합니다. 총량 상한 100GB.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {d.archiveStatus === "DONE" ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-sm">
                <p className="font-medium">
                  보관됨
                  {d.archiveSizeBytes !== undefined &&
                    ` · ${(d.archiveSizeBytes / 1024 / 1024).toFixed(1)} MB`}
                </p>
                <p className="text-muted-foreground text-xs">
                  커밋 <code>{d.archivedSha}</code> 기준
                </p>
              </div>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline">
                  <RefreshCw className="size-4" />
                  다시 받기
                </Button>
                <Button size="sm">
                  <Download className="size-4" />
                  다운로드
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-muted-foreground text-sm">
                아직 아카이브하지 않았습니다.
              </p>
              <Button size="sm" variant="outline" className="ml-auto">
                <Archive className="size-4" />
                아카이브 실행
              </Button>
            </div>
          )}
        </CardContent>
      </UICard>
    </div>
  );
}
