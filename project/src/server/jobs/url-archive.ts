import "server-only";

import { chromium } from "playwright";

import { db } from "@/lib/db";
import { getDiskStatus } from "@/lib/disk";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { assertPublicUrl } from "@/lib/safe-fetch";
import * as storage from "@/lib/storage";
import { register } from "@/server/services/job.service";
import * as settingsService from "@/server/services/settings.service";
import * as storageService from "@/server/services/storage.service";

/**
 * 웹 페이지 보관 (`REQ-01 · 1.1`).
 *
 * ## GitHub 만 지켜 주고 있었습니다
 *
 * 저장소는 tarball 로 보관해 왔는데, 이 팀이 등록한 자료의 절반은 **문서
 * 사이트·논문·블로그**입니다. 그것들이 사라지면 남는 것은 우리가 적어 둔
 * 요약 한 줄뿐이었습니다. `REQ-01 · 1.1` 의 「참고하던 자료가 사라지면 복구
 * 불가」는 GitHub 만의 이야기가 아닙니다.
 *
 * ## 왜 MHTML 인가
 *
 * | | |
 * | --- | --- |
 * | HTML 만 저장 | CSS·이미지가 바깥을 가리켜 **원본이 죽는 날 같이 죽습니다** |
 * | PDF | 글자를 다시 고를 수 없고, 레이아웃이 깨집니다 |
 * | **MHTML** | 크로미움이 **한 파일에** 전부 담습니다 (`Page.captureSnapshot`) |
 *
 * 브라우저에 끌어다 놓으면 그대로 열립니다.
 *
 * ## 「지금 그대로」를 저장하는 것입니다
 *
 * 로그인이 필요한 페이지는 로그인 화면이 저장됩니다. 무한 스크롤 아래쪽은
 * 안 담깁니다. **그게 정직한 결과**이고, 열어 보면 바로 압니다 — 「받았다」고
 * 해 놓고 빈 파일을 주는 것보다 낫습니다.
 */

/**
 * 한 페이지에 이만큼까지.
 *
 * 저장소 tarball 상한(`FR-ADM-015`, 기본 500MB)을 그대로 쓰지 않습니다 —
 * **웹 페이지 한 장이 그만큼이면 그건 사고**입니다. 여기서 끊으면 디스크가
 * 아니라 그 자료 하나만 실패합니다.
 */
const MAX_BYTES = 20 * 1024 * 1024;

/** 페이지가 이 시간 안에 안 뜨면 포기합니다 — 보관은 급한 일이 아닙니다 */
const TIMEOUT_MS = 30_000;

/**
 * **우리 자신은 SSRF 가드에서 예외입니다** — `CHECK_LINK` 와 같은 근거입니다
 * (`lib/safe-fetch.ts` 의 `allowOrigins` 주석). 한 줄로 줄이면: **쿠키 없이
 * 열므로 비로그인 방문과 같습니다.** 여기 브라우저도 매번 새 컨텍스트라
 * 세션이 없어서, 우리 주소를 담아 봐야 로그인 화면이 담깁니다.
 *
 * 열리는 것은 **오리진 하나**입니다 — 호스트가 아니라 「호스트:포트」라서
 * 같은 PC 의 `localhost:5432`(Postgres)는 그대로 막힙니다.
 */
const SELF = [new URL(env.APP_URL).origin];

async function run(job: { resourceId: string | null }) {
  if (!job.resourceId) {
    throw new AppError("INVALID_STATE", "대상 자료가 없는 작업입니다.");
  }

  const resource = await db.resource.findUnique({
    where: { id: job.resourceId, deletedAt: null },
    select: { id: true, url: true, title: true, authorId: true },
  });
  if (!resource) throw new AppError("NOT_FOUND", "자료를 찾을 수 없습니다.");
  if (!resource.url) {
    throw new AppError("INVALID_STATE", "주소가 없는 자료는 보관할 수 없습니다.");
  }

  /*
   * **`await` 를 빠뜨리면 가드가 아무것도 안 합니다** — `url-meta` 에서 실제로
   * 그렇게 짰다가 사내망 주소로 브라우저를 열 뻔했습니다. 이제
   * `no-floating-promises` 가 컴파일 전에 잡지만, 이유는 여기 적어 둡니다.
   */
  await assertPublicUrl(resource.url, SELF);

  // ── 받기 전에 막는다 (`ARCHIVE_GITHUB` 와 같은 순서) ──
  const disk = await getDiskStatus(await settingsService.minFreeGb());
  if (!disk.ok) {
    throw new AppError(
      "DISK_FULL",
      `디스크 여유가 부족해 보관하지 않습니다 (남은 용량 ${disk.freeGb}GB).`
    );
  }
  const total = await storageService.archivedTotalBytes();
  if (total >= storageService.ARCHIVE_LIMIT_BYTES) {
    throw new AppError(
      "ARCHIVE_QUOTA_EXCEEDED",
      "아카이브 총량 100GB 상한에 닿았습니다. 관리자가 오래된 아카이브를 정리해야 합니다."
    );
  }

  const browser = await chromium.launch({ headless: true });
  let mhtml: string;
  try {
    const ctx = await browser.newContext({ locale: "ko-KR" });
    const page = await ctx.newPage();
    await page.goto(resource.url, {
      // 보관은 **다 그려진 뒤**여야 합니다 — 메타만 읽을 때와 다릅니다
      waitUntil: "load",
      timeout: TIMEOUT_MS,
    });
    // 늦게 그리는 부분까지 담습니다
    await page.waitForTimeout(2000);

    /*
     * **`Page.captureSnapshot` 은 CDP 에만 있습니다.** Playwright 의 공개
     * API 에는 MHTML 이 없어서 세션을 직접 엽니다 — 크로미움 전용이고,
     * 이 시스템은 크로미움만 씁니다.
     */
    const cdp = await ctx.newCDPSession(page);
    const snap = (await cdp.send("Page.captureSnapshot", {
      format: "mhtml",
    })) as { data: string };
    mhtml = snap.data;
  } finally {
    await browser.close();
  }

  const bytes = Buffer.from(mhtml, "utf8");
  if (bytes.byteLength > MAX_BYTES) {
    throw new AppError(
      "VALIDATION_ERROR",
      `보관 파일이 상한(${storage.humanBytes(MAX_BYTES)})을 넘었습니다 — ${storage.humanBytes(bytes.byteLength)}.`
    );
  }

  const key = storage.newKey("archives/web", ".mhtml");
  const written = await storage.writeStream(
    key,
    new Blob([bytes]).stream(),
    MAX_BYTES
  );

  const resourceId = resource.id;
  /** 트랜잭션이 끝난 뒤 지울 옛 파일 — **지역 변수여야 합니다**(동시 실행) */
  const staleKeys: string[] = [];

  await db.$transaction(async (tx) => {
    // 자료당 보관본은 하나입니다 — `ARCHIVE_GITHUB` 와 같은 규칙
    const old = await tx.resourceFile.findMany({
      where: { resourceId, role: "ARCHIVE" },
      select: { fileId: true, file: { select: { storageKey: true } } },
    });
    if (old.length) {
      await tx.resourceFile.deleteMany({
        where: { resourceId, role: "ARCHIVE" },
      });
      await tx.file.deleteMany({
        where: { id: { in: old.map((o) => o.fileId) } },
      });
    }

    const file = await tx.file.create({
      data: {
        storageKey: written.key,
        // 내려받았을 때 무엇인지 알아볼 수 있게 — 자료 제목을 씁니다
        originalName: `${safeName(resource.title)}.mhtml`,
        mimeType: "message/rfc822",
        sizeBytes: BigInt(written.sizeBytes),
        checksumSha256: written.sha256,
        // 「올린 사람」은 자료의 등록자입니다 — 보관본은 그 자료에 딸린 것입니다
        uploadedById: resource.authorId,
      },
      select: { id: true },
    });
    await tx.resourceFile.create({
      data: { resourceId, fileId: file.id, role: "ARCHIVE" },
    });

    staleKeys.push(...old.map((o) => o.file.storageKey));
  });

  for (const k of staleKeys) await storage.remove(k).catch(() => {});

  return { sizeBytes: written.sizeBytes, key: written.key };
}

/** 파일 이름에 못 쓰는 글자를 걷어냅니다 — 한글은 그대로 둡니다 */
function safeName(title: string): string {
  return title.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80).trim() || "보관본";
}

register("ARCHIVE_URL", run);
