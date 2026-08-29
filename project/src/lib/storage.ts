import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

/**
 * 로컬 파일 저장소 (`DEC-019`, `NFR-SEC-019`).
 *
 * MinIO 를 쓰지 않기로 했으므로(`DEC-019`) 파일은 이 PC 디스크의
 * `STORAGE_ROOT` 아래에 있습니다. presigned URL 이 없다는 뜻이고,
 * **모든 읽기·쓰기가 앱 서버를 지납니다** — 그래서 항상 스트리밍입니다
 * (`NFR-PERF-007`: 파일 전체를 메모리에 올리지 않는다).
 *
 * ## 저장 키는 **서버만 만듭니다** (`NFR-SEC-019`)
 *
 * 사용자 파일명을 경로에 쓰지 않습니다. `../../etc/passwd` 같은 이름은 물론이고,
 * Windows 의 `CON`·`NUL` 같은 예약어와 유니코드 정규화 차이까지 생각해야
 * 하는데 — **안 쓰면 그 전부가 사라집니다.** 원본 이름은 `files.original_name`
 * 컬럼에만 두고 다운로드 헤더에서 씁니다.
 *
 * ## 그럼에도 **읽기 전에 매번 확인**합니다
 *
 * 키를 서버가 만들어도, 그 키가 DB 를 거쳐 돌아오는 사이에 무엇이든 될 수
 * 있습니다. `resolve()` 가 절대 경로로 편 뒤 `STORAGE_ROOT` 하위인지 봅니다 —
 * 「우리가 만들었으니 안전하다」는 가정을 두지 않습니다.
 */

const ROOT = path.resolve(env.STORAGE_ROOT);

/**
 * 키 → 절대 경로. **경로가 뿌리 밖이면 던집니다.**
 *
 * `path.resolve` 는 `..` 를 실제로 접습니다. 문자열로 `includes("..")` 를
 * 보는 검사는 `%2e%2e`·`....//`·심볼릭 링크에 뚫립니다 — **편 결과를 보는 것**이
 * 유일하게 맞는 방법입니다.
 */
export function resolve(key: string): string {
  const full = path.resolve(ROOT, key);
  const rel = path.relative(ROOT, full);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new AppError("FORBIDDEN", "잘못된 파일 경로입니다.");
  }
  return full;
}

/**
 * 새 저장 키. `{prefix}/{yyyy-mm}/{랜덤}{확장자}`.
 *
 * 날짜로 나누는 것은 **한 폴더에 파일이 무한히 쌓이지 않게** 하기 위해서입니다
 * (탐색기가 느려지고 백업 동기화도 느려집니다).
 * 확장자는 **서버가 판정한 MIME 에서** 나옵니다 — 사용자가 준 이름이 아닙니다.
 */
export function newKey(prefix: string, ext: string): string {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const safeExt = /^\.[a-z0-9]{1,10}$/i.test(ext) ? ext.toLowerCase() : "";
  return `${prefix}/${month}/${randomBytes(16).toString("hex")}${safeExt}`;
}

/**
 * 사람이 읽는 크기. **`MB` 로 반올림하면 작은 값이 「0MB」가 됩니다** —
 * 검증에서 그 문구를 보고 알았습니다. 숫자가 0이면 문구가 거짓말입니다.
 */
export function humanBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)}GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)}MB`;
  if (n >= 1024) return `${Math.round(n / 1024)}KB`;
  return `${n}B`;
}

export interface WriteResult {
  key: string;
  sizeBytes: number;
  sha256: string;
}

/**
 * 스트림을 저장하고 **크기·해시를 «쓰면서» 잽니다.**
 *
 * `Content-Length` 를 믿지 않습니다 — `NFR-SEC-009` 가 *"선언 크기와 실제 기록
 * 바이트를 모두 확인"* 이라고 못 박고 있습니다. 상한을 넘으면 **쓰다 말고
 * 끊고 지웁니다**: 다 받은 뒤에 재면 이미 디스크를 다 쓴 뒤입니다.
 */
export async function writeStream(
  key: string,
  source: ReadableStream<Uint8Array> | NodeJS.ReadableStream,
  maxBytes: number,
  /**
   * **첫 바이트를 보고 거부할 기회.** 매직 넘버 판정이 여기 들어옵니다
   * (`NFR-SEC-009`) — 다 받은 뒤에 보면 이미 디스크를 쓴 뒤이고,
   * 밖에서 미리 읽으면 그 청크가 스트림에서 사라집니다.
   * 던지면 쓰다 말고 끊고 지웁니다.
   */
  verifyHead?: (head: Uint8Array) => void
): Promise<WriteResult> {
  const full = resolve(key);
  await mkdir(path.dirname(full), { recursive: true });

  const hash = createHash("sha256");
  let size = 0;
  let tooBig = false;
  let headSeen = false;

  const counting = async function* (
    chunks: AsyncIterable<Uint8Array>
  ): AsyncGenerator<Uint8Array> {
    for await (const chunk of chunks) {
      if (!headSeen) {
        headSeen = true;
        verifyHead?.(chunk);
      }
      size += chunk.byteLength;
      if (size > maxBytes) {
        tooBig = true;
        // 여기서 던지면 `pipeline` 이 대상 스트림을 닫아 준다
        throw new AppError(
          "PAYLOAD_TOO_LARGE",
          `허용 크기(${humanBytes(maxBytes)})를 넘었습니다.`
        );
      }
      hash.update(chunk);
      yield chunk;
    }
  };

  const input =
    source instanceof ReadableStream
      ? (source as unknown as AsyncIterable<Uint8Array>)
      : (source as unknown as AsyncIterable<Uint8Array>);

  try {
    await pipeline(input, counting, createWriteStream(full));
  } catch (e) {
    // **반쯤 쓴 파일을 남기지 않습니다** — 다음 사람이 정상 파일로 오해합니다
    await rm(full, { force: true });
    // 크기 초과와 «판정 거부»는 사용자가 고칠 수 있는 오류라 그대로 올린다
    if (tooBig || e instanceof AppError) throw e;
    throw new AppError("INTERNAL_ERROR", "파일을 저장하지 못했습니다.");
  }

  return { key, sizeBytes: size, sha256: hash.digest("hex") };
}

/** 읽기 스트림. `Range` 응답을 위해 구간을 받습니다 (`FR-GH-004`·`FR-FILE-002`) */
export function readStream(
  key: string,
  range?: { start: number; end: number }
): NodeJS.ReadableStream {
  return createReadStream(resolve(key), range);
}

export async function size(key: string): Promise<number> {
  const s = await stat(resolve(key));
  return s.size;
}

export async function exists(key: string): Promise<boolean> {
  try {
    await stat(resolve(key));
    return true;
  } catch {
    return false;
  }
}

export async function remove(key: string): Promise<void> {
  await rm(resolve(key), { force: true });
}

/*
 * **아카이브 단건 상한은 `settings.service` 가 압니다** (`FR-ADM-015`).
 *
 * 여기 상수로 두었을 때는 관리자 화면에서 바꿔도 아무 일이 없었을 자리입니다 —
 * `.env` 는 이제 **기본값**이고, DB 에 행이 있으면 그쪽이 이깁니다
 * (`content_type_settings` 와 같은 규칙).
 */
