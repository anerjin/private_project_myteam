"use client";

import { Archive, Download } from "lucide-react";
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
import { archiveUrlAction } from "@/server/actions/github.actions";

/**
 * 웹 페이지 보관 (`REQ-01 · 1.1`).
 *
 * GitHub 자료의 `GithubPanel` 과 **같은 자리·같은 말투**입니다. 다른 점은
 * 받아 두는 것이 소스가 아니라 **그 페이지 자체**(MHTML)라는 것뿐입니다.
 *
 * ## 「받는 중」이 아니라 **「작업을 만들었다」**고 말합니다
 *
 * 페이지를 띄우고 다 그려질 때까지 기다렸다가 담습니다 — 버튼을 누른 순간
 * 끝나는 일이 아닙니다. 끝났다고 말하면 거짓말입니다.
 */
export function WebArchivePanel({
  resourceId,
  archived,
  canEdit,
}: {
  resourceId: string;
  /** 이미 보관해 둔 것 — 없으면 `null` */
  archived: { name: string; sizeBytes: number } | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Archive className="size-4" />
          웹 페이지 보관
        </CardTitle>
        <CardDescription>
          {archived
            ? "원본이 사라져도 남도록 이 페이지를 통째로 보관해 두었습니다."
            : "원본이 사라져도 남도록 이 페이지를 통째로 보관합니다."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {archived && (
          <p className="text-sm font-medium">
            보관됨 · {(archived.sizeBytes / 1024 / 1024).toFixed(1)} MB
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {archived && (
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

          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await archiveUrlAction(resourceId);
                  if (!r.ok) {
                    toast.error(r.message ?? "실행하지 못했습니다.");
                    return;
                  }
                  toast.success("보관을 시작했습니다.", {
                    description:
                      "진행 상황은 관리자 › 작업 모니터에서 볼 수 있습니다.",
                  });
                  router.refresh();
                })
              }
            >
              <Archive className="size-4" />
              {archived ? "다시 보관" : "페이지 보관"}
            </Button>
          )}
        </div>

        {archived && (
          <p className="text-muted-foreground text-xs">
            <code>.mhtml</code> 파일입니다. 브라우저에 끌어다 놓으면 그때 모습
            그대로 열립니다.
          </p>
        )}
        {!archived && !canEdit && (
          <p className="text-muted-foreground text-xs">
            아직 보관하지 않았습니다.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
