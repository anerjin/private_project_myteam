"use client";

import { Archive, Download, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  refreshGithubMetaAction,
  startArchiveAction,
} from "@/server/actions/github.actions";

/**
 * GitHub 자료의 수집·아카이브 조작 (`FR-GH-003`·`004`·`005`).
 *
 * ## 「받는 중」이 아니라 **「작업을 만들었다」**고 말합니다
 *
 * 아카이브는 최대 500MB 이고 같은 프로세스가 응답 뒤에 처리합니다(`DEC-053`).
 * 버튼을 누른 순간 끝나는 일이 아니므로 **끝났다고 말하면 거짓말**입니다 —
 * 「시작했습니다」라고 하고 진행 상황이 어디 있는지 알려 줍니다.
 *
 * ## 자동으로 하지 않습니다
 *
 * `DEC-022` 가 「선택 실행 + 총량 100GB」로 정했습니다. 등록마다 받으면
 * 개발 PC 디스크가 며칠 만에 찹니다.
 */
export function GithubPanel({
  resourceId,
  archiveStatus,
  archiveSizeBytes,
  archivedSha,
  isGone,
}: {
  resourceId: string;
  archiveStatus: string;
  /** 표시용. 정본은 `files.size_bytes` (`DEV-02 · 2.7`) */
  archiveSizeBytes?: number;
  archivedSha?: string;
  /** 원본이 삭제·비공개로 바뀌었는가 (`FR-GH-007`) */
  isGone: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const running = archiveStatus === "RUNNING" || archiveStatus === "QUEUED";
  const done = archiveStatus === "DONE";

  const run = (
    fn: () => Promise<{ ok: boolean; message?: string }>,
    started: string
  ) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.message ?? "실행하지 못했습니다.");
        return;
      }
      toast.success(started, {
        description: "진행 상황은 관리자 › 작업 모니터에서 볼 수 있습니다.",
      });
      // 잠시 뒤 상태가 바뀌므로 새로 읽는다
      router.refresh();
    });

  return (
    <Card>
      {/*
        **같은 말을 두 번 하지 않습니다.**

        여기와 상세 위쪽이 「저장소를 찾을 수 없습니다」를 나란히 띄우고
        있었습니다. 게다가 이쪽은 「아카이브도 없습니다」라고 하는데 상세
        위쪽은 같은 화면에서 「아래 아카이브를 이용하세요」라고 했습니다 —
        **한 화면이 서로 반대되는 말을 했습니다.**

        저장소 상태 안내는 `content-types/github-repo/detail.tsx` 한 곳으로
        모았습니다. 이 카드는 **아카이브** 이야기만 합니다.

        > 그 타입 폴더에는 「소스 아카이브」라는 **또 다른 카드**도 있었습니다.
        > 버튼이 셋 달렸는데 셋 다 `onClick` 이 없었습니다 — 서버 컴포넌트라
        > 있을 수도 없었고, 누르면 아무 일도 안 났습니다. 진짜 도는 버튼은
        > 여기였고, 같은 화면에 **둘이 나란히** 있었습니다. 지웠습니다.
      */}
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Archive className="size-4" />
          소스 아카이브
        </CardTitle>
        <CardDescription>
          {done
            ? "원본이 사라져도 남도록 사내 디스크에 보관해 두었습니다."
            : "원본이 사라져도 남도록 사내 디스크에 보관합니다. 총량 상한 100GB."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {done && (
          <div className="text-sm">
            <p className="font-medium">
              보관됨
              {archiveSizeBytes !== undefined &&
                ` · ${(archiveSizeBytes / 1024 / 1024).toFixed(1)} MB`}
            </p>
            {archivedSha && (
              <p className="text-muted-foreground text-xs">
                커밋 <code>{archivedSha.slice(0, 10)}</code> 기준
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {done && (
            <Button variant="outline" size="sm" asChild>
              {/*
              `Link` 가 아니라 `a` 입니다 — 라우터가 가로채면 스트림 응답이
              페이지 전환으로 읽힙니다. 다운로드는 브라우저에 맡깁니다.
            */}
              <a href={`/api/resources/${resourceId}/archive`}>
                <Download className="size-4" />
                내려받기
              </a>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              run(
                () => refreshGithubMetaAction(resourceId),
                "메타 수집을 시작했습니다."
              )
            }
          >
            <RefreshCw className="size-4" />
            메타 갱신
          </Button>

          {/*
              > **`RUNNING` 에서 버튼을 잠그면 빠져나올 길이 없습니다.**
              > PC 가 꺼져 중단되면 자료가 영구히 「아카이브 진행 중」이고
              > 다시 받기도 내려받기도 안 됩니다 — 그 상태를 만든 것이
              > `DEC-053`(별도 워커 없음)이므로 **여기서 받아 줘야** 합니다.
              > 작업 자체의 재실행은 `admin/jobs` 가 하고, 여기서는 새 작업을
              > 만듭니다. `runNow` 가 「돌고 있는 것」을 두 번 안 집으므로
              > 살아 있는 실행과 겹치지 않습니다.
            */}
          {/*
              **읽지 못하는 저장소는 아카이브도 못 받습니다.**

              그런데 버튼이 그대로 있어서, 운영자가 눌렀고 작업이
              `HTTP 404` 로 실패해 실패 목록에 한 줄이 쌓였습니다.
              **눌러도 안 되는 버튼**은 이 저장소가 반복해서 지워 온 것이라,
              잠그고 «왜 안 되는지»를 함께 답니다.

              이미 받아 둔 아카이브가 있으면 잠그지 않습니다 — 원본이 사라진
              뒤에도 다시 시도해 볼 이유가 있습니다.
            */}
          <Button
            variant="outline"
            size="sm"
            disabled={pending || (isGone && !done)}
            title={
              isGone && !done
                ? "저장소를 읽지 못해 아카이브를 받을 수 없습니다"
                : undefined
            }
            onClick={() =>
              run(
                () => startArchiveAction(resourceId),
                "아카이브를 시작했습니다."
              )
            }
          >
            <Archive className="size-4" />
            {running
              ? "아카이브 다시 시도"
              : done
                ? "아카이브 다시 받기"
                : "소스 아카이브"}
          </Button>
          {running && (
            <span className="text-muted-foreground self-center text-xs">
              진행 중입니다. 멈춰 있으면 다시 시도해 주세요.
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
