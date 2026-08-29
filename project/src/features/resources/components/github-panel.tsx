"use client";

import { Archive, Download, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
  isGone,
  canEdit,
}: {
  resourceId: string;
  archiveStatus: string;
  /** 원본이 삭제·비공개로 바뀌었는가 (`FR-GH-007`) */
  isGone: boolean;
  canEdit: boolean;
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
    <div className="space-y-3">
      {/*
        **원본 소실** (`FR-GH-007`). 이게 이 시스템의 존재 이유 중 하나입니다 —
        `REQ-01 · 1.1` 이 「참고하던 GitHub 저장소가 삭제·비공개 전환되면 복구
        불가」를 문제로 적어 뒀습니다. 그러니 사라졌을 때 **아카이브를 강조**해야
        하고, 아카이브가 없으면 그 사실도 말해야 합니다.
      */}
      {isGone && (
        <Alert variant={done ? "default" : "destructive"}>
          <AlertTitle>원본 저장소를 찾을 수 없습니다</AlertTitle>
          <AlertDescription>
            {done
              ? "삭제됐거나 비공개로 바뀌었습니다. 보관해 둔 아카이브로 소스를 받을 수 있습니다."
              : "삭제됐거나 비공개로 바뀌었고, 아카이브도 없습니다. 이 자료의 요약·README 만 남아 있습니다."}
          </AlertDescription>
        </Alert>
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
              아카이브 내려받기
            </a>
          </Button>
        )}

        {canEdit && (
          <>
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

            <Button
              variant="outline"
              size="sm"
              disabled={pending || running}
              onClick={() =>
                run(
                  () => startArchiveAction(resourceId),
                  "아카이브를 시작했습니다."
                )
              }
            >
              <Archive className="size-4" />
              {running
                ? "아카이브 진행 중"
                : done
                  ? "아카이브 다시 받기"
                  : "소스 아카이브"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
