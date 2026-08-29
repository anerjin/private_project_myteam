import "server-only";

/**
 * 업로드 파일 판정 (`NFR-SEC-009`, `FR-FILE-004`).
 *
 * > **확장자 + MIME + 매직 넘버 3중 검증. 실행 파일 차단.**
 *
 * ## 셋을 다 보는 이유
 *
 * | 보는 것 | 누가 정하나 | 혼자 두면 |
 * | --- | --- | --- |
 * | 확장자 | **사용자** | `evil.exe` 를 `report.pdf` 로 이름만 바꾸면 통과 |
 * | `Content-Type` | **브라우저/클라이언트** | 요청 헤더라 손으로 아무거나 쓸 수 있다 |
 * | 매직 넘버 | **파일 내용** | 확장자 없는 텍스트가 걸린다 |
 *
 * 셋이 **서로를 검산**합니다. 앞의 둘은 사용자가 고를 수 있고, 마지막 하나만
 * 파일 자신이 말합니다 — 그래서 **매직 넘버가 최종 판정**이고 앞의 둘은
 * 「말이 맞는가」를 봅니다.
 *
 * ## 허용 목록입니다
 *
 * 차단 목록(`.exe`·`.bat`…)은 언제나 뚫립니다 — `.scr`·`.msi`·`.lnk`·`.ps1` 을
 * 다 적어야 하고 새 확장자가 생기면 늘려야 합니다. **허용한 것만 받습니다.**
 */

export interface FileKind {
  ext: string;
  mime: string;
  /** 파일 머리 바이트. 없으면 매직 넘버가 없는 형식(텍스트) */
  magic?: number[][];
  /**
 * 이미지인가 — 미리보기·썸네일이 볼 값.
 *
 * **그 화면은 아직 없습니다.** 첨부 목록은 이름과 내려받기 링크만 그립니다.
 * 인라인으로 그리기 시작하면 원본(최대 50MB)을 그대로 받게 되므로,
 * 그때 썸네일이 «장식»에서 «필수»로 바뀝니다 — `check:fr` 의 부채 항목에
 * 그 조건이 적혀 있습니다.
 */
  image?: boolean;
}

/**
 * 받는 형식.
 *
 * 사내 자료 첨부에 실제로 오는 것들입니다 — 문서·이미지·데이터·압축.
 * **`svg` 는 뺐습니다**: XML 이라 스크립트를 품을 수 있고, 이미지처럼 보이지만
 * 브라우저에서 실행됩니다. `NFR-SEC-020` 의 `nosniff` 로도 `<img>` 경로는
 * 막히지 않습니다.
 */
const KINDS: FileKind[] = [
  { ext: ".pdf", mime: "application/pdf", magic: [[0x25, 0x50, 0x44, 0x46]] },
  { ext: ".png", mime: "image/png", magic: [[0x89, 0x50, 0x4e, 0x47]], image: true },
  { ext: ".jpg", mime: "image/jpeg", magic: [[0xff, 0xd8, 0xff]], image: true },
  { ext: ".jpeg", mime: "image/jpeg", magic: [[0xff, 0xd8, 0xff]], image: true },
  { ext: ".gif", mime: "image/gif", magic: [[0x47, 0x49, 0x46, 0x38]], image: true },
  {
    ext: ".webp",
    mime: "image/webp",
    // `RIFF....WEBP` — 4바이트 크기를 건너뛰므로 접두어만 본다
    magic: [[0x52, 0x49, 0x46, 0x46]],
    image: true,
  },
  { ext: ".zip", mime: "application/zip", magic: [[0x50, 0x4b, 0x03, 0x04]] },
  {
    ext: ".gz",
    mime: "application/gzip",
    magic: [[0x1f, 0x8b]],
  },
  /*
   * `docx`·`xlsx`·`pptx` 는 **실제로 zip 입니다** — 매직 넘버가 `PK\x03\x04`
   * 라 zip 과 구별되지 않습니다. 확장자·MIME 으로만 가르고, 그래도 안전한
   * 이유는 **어차피 실행되지 않게 내려주기** 때문입니다 (`NFR-SEC-020`).
   */
  {
    ext: ".docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    magic: [[0x50, 0x4b, 0x03, 0x04]],
  },
  {
    ext: ".xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    magic: [[0x50, 0x4b, 0x03, 0x04]],
  },
  {
    ext: ".pptx",
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    magic: [[0x50, 0x4b, 0x03, 0x04]],
  },
  // 매직 넘버가 없는 텍스트류 — 내용으로는 못 가르므로 확장자·MIME 으로만
  { ext: ".md", mime: "text/markdown" },
  { ext: ".txt", mime: "text/plain" },
  { ext: ".csv", mime: "text/csv" },
  { ext: ".json", mime: "application/json" },
  { ext: ".yaml", mime: "application/yaml" },
  { ext: ".yml", mime: "application/yaml" },
];

export function extensionOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i < 0 ? "" : filename.slice(i).toLowerCase();
}

export interface Verdict {
  ok: boolean;
  kind?: FileKind;
  reason?: string;
}

/**
 * 파일 머리 바이트로 판정합니다.
 *
 * **`head` 는 8바이트면 충분합니다** — 스트리밍 중 첫 청크에서 떼어냅니다.
 * 전체를 읽어야 판정할 수 있으면 `NFR-PERF-007`(메모리에 올리지 않는다)과
 * 충돌합니다.
 */
export function verify(
  filename: string,
  declaredMime: string,
  head: Uint8Array
): Verdict {
  const ext = extensionOf(filename);
  if (!ext) {
    return { ok: false, reason: "확장자가 없는 파일은 받지 않습니다." };
  }

  const candidates = KINDS.filter((k) => k.ext === ext);
  if (candidates.length === 0) {
    return {
      ok: false,
      reason: `${ext} 형식은 받지 않습니다. 허용: ${[...new Set(KINDS.map((k) => k.ext))].join(" ")}`,
    };
  }

  const mime = declaredMime.split(";")[0].trim().toLowerCase();
  const byMime = candidates.filter((k) => k.mime === mime);
  if (mime && byMime.length === 0) {
    return {
      ok: false,
      reason: `확장자(${ext})와 형식(${mime})이 맞지 않습니다.`,
    };
  }

  const kind = (byMime[0] ?? candidates[0]) as FileKind;
  if (!kind.magic) return { ok: true, kind };

  const matched = kind.magic.some((sig) =>
    sig.every((b, i) => head[i] === b)
  );
  if (!matched) {
    return {
      ok: false,
      reason: `${ext} 파일이 아닙니다. 이름만 바꾼 다른 형식일 수 있습니다.`,
    };
  }
  return { ok: true, kind };
}

/** 판정된 형식이 이미지인가 */
export function isImage(mime: string): boolean {
  return KINDS.some((k) => k.mime === mime && k.image);
}
