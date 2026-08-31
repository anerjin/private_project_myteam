import { File, Folder, FileText } from "lucide-react";

import { MarkdownViewer } from "@/components/common/markdown-viewer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RepoFile } from "@/types";

/**
 * 저장소 첫 화면 — **파일 목록과 README** (`FR-GH-002`).
 *
 * ## 왜 여기 있어야 하는가
 *
 * 자료를 열었을 때 사람이 제일 먼저 알고 싶은 것은 「이게 뭐 하는 저장소인가」
 * 입니다. 그 답은 README 에 있는데, **받아 두고도 한 번도 그리지 않았습니다** —
 * `readme_content` 는 `P6` 부터 채워지고 있었고 화면에는 없었습니다.
 *
 * ## 최상위만 있습니다
 *
 * 하위 폴더로 들어가려면 요청마다 GitHub API 를 불러야 하고, 토큰이 없으면
 * 시간당 60회입니다 — 폴더 몇 번 누르면 그날의 메타 수집이 멈춥니다. 그래서
 * **폴더는 GitHub 으로 보냅니다.** 대신 최상위 목록은 DB 에 있어서
 * **원본이 사라진 뒤에도 남습니다** (`REQ-01 · 1.1`).
 */
export function RepoBrowser({
  owner,
  repo,
  defaultBranch,
  files,
  readme,
  isGone,
}: {
  owner: string;
  repo: string;
  defaultBranch?: string;
  files: RepoFile[];
  readme: string | null;
  /** 원본이 사라졌으면 GitHub 으로 보내는 링크가 죽습니다 */
  isGone: boolean;
}) {
  const branch = defaultBranch ?? "HEAD";
  const base = `https://github.com/${owner}/${repo}`;

  return (
    <div className="space-y-4">
      {files.length > 0 && (
        <Card className="overflow-hidden py-0">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <span className="font-mono text-sm">
              {owner}/<b>{repo}</b>
            </span>
            <span className="text-muted-foreground ml-auto text-xs">
              최상위 {files.length}개
            </span>
          </div>
          <ul className="divide-y text-sm">
            {files.map((f) => {
              /*
               * 폴더는 GitHub 으로 나갑니다. **원본이 사라졌으면 링크를 걸지
               * 않습니다** — 눌러서 404 를 만나는 것보다 못 간다고 보이는 편이
               * 낫습니다.
               */
              const href =
                f.type === "dir"
                  ? `${base}/tree/${branch}/${encodeURIComponent(f.name)}`
                  : `${base}/blob/${branch}/${encodeURIComponent(f.name)}`;

              const row = (
                <>
                  {f.type === "dir" ? (
                    <Folder className="size-4 shrink-0 text-sky-500" />
                  ) : (
                    <File className="text-muted-foreground size-4 shrink-0" />
                  )}
                  <span className="truncate">{f.name}</span>
                  {f.size !== undefined && (
                    <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
                      {formatSize(f.size)}
                    </span>
                  )}
                </>
              );

              return (
                <li key={`${f.type}-${f.name}`}>
                  {isGone ? (
                    <span className="text-muted-foreground flex items-center gap-2 px-4 py-2">
                      {row}
                    </span>
                  ) : (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:bg-muted/60 flex items-center gap-2 px-4 py-2"
                    >
                      {row}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
          {!isGone && (
            <p className="text-muted-foreground border-t px-4 py-2 text-xs">
              최상위만 보관합니다. 하위 폴더는 GitHub 에서 열립니다.
            </p>
          )}
        </Card>
      )}

      {readme && (
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="size-4" />
              README
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {/*
              **`rehype-sanitize` 를 지나는 뷰어**를 씁니다 (`NFR-SEC-007`).
              README 는 바깥에서 온 글이라 스크립트도 `onerror` 도 들어올 수
              있습니다 — 자료 본문과 같은 문을 쓰게 두면 규칙이 한 곳입니다.
            */}
            <MarkdownViewer content={readme} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** GitHub 처럼 KB·MB 로 — 바이트 그대로는 아무도 안 읽습니다 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
