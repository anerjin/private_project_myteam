"use client";

import { Download, Paperclip, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { detachFileAction } from "@/server/actions/file.actions";

export interface AttachmentItem {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * 첨부 (`FR-FILE-001`~`003`).
 *
 * ## 업로드는 **본문 그대로** 보냅니다
 *
 * `FormData` 로 감싸면 Server Action 이 파일 전체를 메모리에 올립니다
 * (`NFR-PERF-007`). `fetch(url, { body: file })` 는 브라우저가 **스트리밍**
 * 하므로 50MB 를 올려도 메모리가 안 튑니다.
 *
 * 여러 개는 **순서대로 하나씩** 보냅니다 — 진행 상황을 파일마다 말할 수 있고,
 * 하나가 거부돼도 나머지는 올라갑니다.
 */
export function Attachments({
  resourceId,
  files,
  canEdit,
}: {
  resourceId: string;
  files: AttachmentItem[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function upload(list: FileList) {
    for (const file of Array.from(list)) {
      setBusy(file.name);
      try {
        const res = await fetch(
          `/api/files?resourceId=${encodeURIComponent(resourceId)}`,
          {
            method: "POST",
            headers: {
              // 한글 이름은 헤더에 그대로 못 들어갑니다
              "x-filename": encodeURIComponent(file.name),
              "content-type": file.type || "application/octet-stream",
            },
            body: file,
            // 스트리밍 업로드에 필요합니다
            duplex: "half",
          } as RequestInit & { duplex: "half" }
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          toast.error(`${file.name} — ${body?.error?.message ?? "올리지 못했습니다."}`);
          continue;
        }
        toast.success(`${file.name} 첨부했습니다.`);
      } catch {
        toast.error(`${file.name} 을 올리지 못했습니다.`);
      }
    }
    setBusy(null);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  function remove(id: string, name: string) {
    startTransition(async () => {
      const r = await detachFileAction(id);
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success(`${name} 을 지웠습니다.`);
      router.refresh();
    });
  }

  if (files.length === 0 && !canEdit) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Paperclip className="size-4" />
          첨부 {files.length > 0 && `(${files.length})`}
        </CardTitle>
        {canEdit && (
          <div>
            <input
              ref={input}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && upload(e.target.files)}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => input.current?.click()}
            >
              <Upload className="size-4" />
              {busy ? `${busy} 올리는 중…` : "파일 추가"}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {files.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            아직 첨부가 없습니다. 설정 파일이나 스크린샷을 함께 두면 다음 사람이
            바로 씁니다.
          </p>
        ) : (
          <ul className="divide-y">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate text-sm">
                  {f.originalName}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {formatSize(f.sizeBytes)}
                </span>
                <Button variant="ghost" size="icon" aria-label="내려받기" asChild>
                  {/* 스트림 응답이므로 라우터가 아니라 브라우저에 맡깁니다 */}
                  <a href={`/api/files/${f.id}`}>
                    <Download className="size-4" />
                  </a>
                </Button>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="삭제"
                    disabled={pending}
                    onClick={() => remove(f.id, f.originalName)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function formatSize(n: number): string {
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)}MB`;
  if (n >= 1024) return `${Math.round(n / 1024)}KB`;
  return `${n}B`;
}
