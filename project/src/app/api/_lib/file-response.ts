import "server-only";

import { Readable } from "node:stream";

import * as storage from "@/lib/storage";

/**
 * 파일 스트림 응답 (`NFR-PERF-007`·`NFR-SEC-020`, `DEV-05` API-032·API-042).
 *
 * ## 항상 스트리밍입니다
 *
 * MinIO 를 안 쓰므로(`DEC-019`) presigned URL 이 없고 **모든 바이트가 앱 서버를
 * 지납니다.** 500MB 아카이브를 `Buffer` 로 읽으면 개발 PC 가 그대로 눌립니다.
 *
 * ## 실행되지 않게 내려줍니다 (`NFR-SEC-020`)
 *
 * `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`.
 * 업로드된 HTML·SVG 가 브라우저에서 «우리 도메인의 페이지»로 열리면 그것이
 * 곧 XSS 입니다. 첨부는 **언제나 내려받기**입니다.
 *
 * ## `Range` 를 지원합니다 (`FR-GH-004`)
 *
 * 500MB 아카이브를 받다 끊기면 처음부터 다시 받아야 하는데, 개발 PC 를
 * 서버로 쓰는 1단계에서는 그 일이 실제로 일어납니다.
 */

/** RFC 7233 의 단일 구간만 봅니다 — 여러 구간은 쓸 일이 없습니다 */
function parseRange(
  header: string | null,
  size: number
): { start: number; end: number } | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;

  const [, rawStart, rawEnd] = m;
  if (rawStart === "" && rawEnd === "") return null;

  // `bytes=-500` — 끝에서 500바이트
  if (rawStart === "") {
    const len = Number(rawEnd);
    if (!len) return null;
    return { start: Math.max(0, size - len), end: size - 1 };
  }

  const start = Number(rawStart);
  const end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  if (start > end || start >= size) return null;
  return { start, end };
}

export interface FilePayload {
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes?: number;
  /**
   * 내려받기가 아니라 **화면에 그리게** 합니다 (`inline`).
   *
   * 기본은 `attachment` 입니다 — 그 이유가 이 파일 머리에 있습니다
   * (`NFR-SEC-020`: 올라온 HTML·SVG 가 우리 도메인의 페이지로 열리면 XSS).
   *
   * 그래서 **이미지일 때만** 허용합니다. 아래에서 `image/` 로 시작하는지
   * 한 번 더 봅니다 — 부르는 쪽이 실수해도 `attachment` 로 떨어집니다.
   * PNG 는 `nosniff` 와 함께라면 브라우저가 무엇을 해도 실행되지 않습니다.
   *
   * 쓰는 곳: 네오가 찍은 화면 캡처를 답 안에 그릴 때.
   */
  inline?: boolean;
}

export async function streamFile(
  req: Request,
  file: FilePayload
): Promise<Response> {
  if (!(await storage.exists(file.storageKey))) {
    return new Response("파일이 저장소에 없습니다.", { status: 404 });
  }

  /*
   * **DB 의 크기를 믿지 않고 디스크를 봅니다.** 둘이 어긋나면 `Content-Length`
   * 가 거짓이 되어 다운로드가 중간에 멈춥니다 — 그 어긋남은 실제로 생깁니다
   * (실패한 쓰기·수동 복원).
   */
  const size = await storage.size(file.storageKey);
  const range = parseRange(req.headers.get("range"), size);

  const headers = new Headers({
    "content-type": file.mimeType || "application/octet-stream",
    // 한글 파일명 — `filename*` 이 정본이고 `filename` 은 옛 클라이언트용
    "content-disposition": `${
      file.inline && file.mimeType.startsWith("image/") ? "inline" : "attachment"
    }; filename="${asciiFallback(file.filename)}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    "x-content-type-options": "nosniff",
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=0, must-revalidate",
  });

  const node = storage.readStream(file.storageKey, range ?? undefined);
  const body = Readable.toWeb(node as Readable) as ReadableStream<Uint8Array>;

  if (range) {
    headers.set("content-length", String(range.end - range.start + 1));
    headers.set("content-range", `bytes ${range.start}-${range.end}/${size}`);
    return new Response(body, { status: 206, headers });
  }

  headers.set("content-length", String(size));
  return new Response(body, { status: 200, headers });
}

/** 헤더에 넣을 수 있는 이름 — 한글은 `filename*` 이 담당합니다 */
function asciiFallback(name: string): string {
  const cleaned = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return cleaned || "download";
}
