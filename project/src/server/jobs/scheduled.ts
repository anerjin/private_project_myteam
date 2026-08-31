import "server-only";

import { chromium, type Browser } from "playwright";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { safeFetch } from "@/lib/safe-fetch";
import * as storage from "@/lib/storage";
import { register } from "@/server/services/job.service";

/**
 * 스케줄 작업 셋 (`REQ-04 · 4.8`).
 *
 * | 작업 | 주기 | 하는 일 |
 * | --- | --- | --- |
 * | `REFRESH_GITHUB_META` | 주 1회 | 등록된 저장소 메타 갱신, 소실 감지 |
 * | `CHECK_LINK` | 월 1회 | 원본 링크 생존 확인 |
 * | `CLEANUP_TRASH` | 일 1회 | 30일 지난 삭제 자료 정리 |
 *
 * ## 언제 도는가는 여기 없습니다
 *
 * 주기는 `maintenance.service` 가 압니다. 이 파일은 **무엇을 하는가**만
 * 압니다 — `DEC-053` 이 「`jobs` 행을 만드는 자리」와 「실행하는 자리」를
 * 나눠 둔 이유이고, 나중에 큐로 옮길 때 바뀌는 것은 앞쪽뿐입니다.
 *
 * ## 하나가 실패해도 나머지는 돕니다
 *
 * 저장소 100개 중 3개가 사라졌다고 갱신 작업 전체를 실패로 만들면, 나머지
 * 97개는 영원히 안 갱신됩니다. **건별로 세고 결과를 payload 에 남깁니다** —
 * `admin/jobs` 가 그 숫자를 보여줍니다.
 */

/* ── 주 1회: 저장소 메타 갱신 ─────────────────────────────────────── */

register("REFRESH_GITHUB_META", async () => {
  const repos = await db.githubRepo.findMany({
    where: { resource: { deletedAt: null } },
    select: { resourceId: true },
  });

  /*
   * **여기서 GitHub 을 부르지 않습니다.** 개별 수집은 이미
   * `FETCH_GITHUB_META` 가 하고, 그쪽은 실패·소실 처리·`is_gone` 을 압니다.
   * 이 작업은 **그것을 저장소 수만큼 큐에 넣는 일**만 합니다 —
   * 규칙을 두 곳에 두지 않기 위해서입니다.
   *
   * 동시 실행은 `job.service` 의 세마포어(2)가 막습니다. 토큰 없이 시간당
   * 60회이므로 저장소가 그보다 많으면 일부는 다음 주에 갱신됩니다 —
   * 그것이 「전부 실패」보다 낫습니다.
   */
  const { enqueue } = await import("@/server/services/job.service");
  for (const r of repos) {
    await enqueue({ type: "FETCH_GITHUB_META", resourceId: r.resourceId });
  }

  return { queued: repos.length };
});

/* ── 월 1회: 원본 링크 생존 확인 ──────────────────────────────────── */

/** 링크 하나에 이만큼 넘게 기다리지 않습니다 — 죽은 링크는 대개 응답이 없습니다 */
const LINK_TIMEOUT_MS = 8000;

/**
 * **우리 자신은 SSRF 가드에서 예외입니다.**
 *
 * 1단계 주소가 `http://localhost:3100` 이라 가드에 그대로 걸립니다. 여는 것이
 * 새 능력을 주지 않는 이유는 `lib/safe-fetch.ts` 의 `allowOrigins` 주석에
 * 있습니다 — 한 줄로 줄이면 **쿠키 없이 나가므로 비로그인 요청과 같습니다.**
 */
const SELF = [new URL(env.APP_URL).origin];

/**
 * 페이지가 「없다」고 스스로 말하는 문구.
 *
 * **여기 걸리면 `MOVED` 입니다 — `GONE` 이 아닙니다.** 이것은 추측이고,
 * 추측으로 「원본이 없어졌다」고 못 박으면 되돌리는 사람이 아무도 없습니다.
 * 게다가 개발팀 자료실에는 **「404 에러 해결법」 같은 제목이 실제로 있습니다.**
 * `MOVED` 는 「사람이 보고 판단하라」는 뜻이라 그 자리에 맞습니다.
 */
const SOFT_404 = [
  /\b404\b/,
  /not\s*found/i,
  /page\s+(?:does\s*not|doesn'?t)\s+exist/i,
  /페이지를?\s*찾을\s*수\s*없/,
  /존재하지\s*않는\s*페이지/,
];

/** 본문을 이만큼만 읽습니다 — `<title>` 은 앞에 있고, 나머지는 볼 이유가 없습니다 */
const BODY_PEEK_BYTES = 64 * 1024;

/**
 * **문턱이 둘인 이유 — 뜻이 다릅니다.**
 *
 * | | 값 | 틀렸을 때의 대가 |
 * | --- | --- | --- |
 * | `PEEK_TEXT_MIN` | 200 | 브라우저를 한 번 더 엽니다 — **싸다** |
 * | `RENDERED_TEXT_MIN` | 30 | 멀쩡한 자료에 「확인 필요」가 붙습니다 — **비싸다** |
 *
 * 그래서 앞은 넉넉하게(의심되면 다시 본다), 뒤는 **아주 엄격하게**(다 그렸는데도
 * 사실상 아무것도 없을 때만) 잡습니다.
 *
 * > 처음엔 둘 다 200 이었습니다. 그랬더니 **우리 로그인 화면(94자)** 이
 * > 「죽었다」로 나왔습니다 — 짧지만 멀쩡히 살아 있는 화면입니다. 한국어는
 * > 글자당 정보가 많아 200자면 꽤 긴 문서입니다.
 */
const PEEK_TEXT_MIN = 200;
const RENDERED_TEXT_MIN = 30;

/** 앞부분만 읽고 **스트림을 끊습니다** — 죽은 링크 확인에 5MB 를 받을 이유가 없습니다 */
async function peek(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < BODY_PEEK_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(
    Buffer.concat(chunks.map((c) => Buffer.from(c)))
  );
}

function titleOf(html: string): string {
  return /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
}

/** 스크립트·스타일을 뺀 «사람이 읽는» 글자 수 */
function visibleTextLength(html: string): number {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

interface HttpProbe {
  verdict: "OK" | "MOVED" | "GONE";
  /**
   * HTTP 는 «있다»고 했는데 **판단할 내용이 없었습니다.**
   *
   * JS 로 그리는 사이트는 첫 HTML 이 빈 껍데기라, 문서가 사라져도 200 이고
   * 본문도 비어 있습니다 — **HTTP 만으로는 구별할 수 없습니다.** 이때만
   * 브라우저를 엽니다.
   */
  needsRender: boolean;
}

/**
 * 한 링크의 생존 — 1단계, HTTP.
 *
 * > **전에는 `HEAD` 를 먼저 썼습니다.** 본문을 안 받아 빠르지만, 그래서
 * > **본문을 볼 수 없었습니다** — 문서가 사라진 자리에 「Page not found」를
 * > 200 으로 돌려주는 사이트를 전부 `OK` 로 셌습니다. 지금은 `GET` 한 번으로
 * > 끝내고 앞 64KB 만 읽습니다. 요청 수는 오히려 줄었습니다(`405` 재시도가
 * > 없어졌습니다).
 */
async function probeHttp(url: string): Promise<HttpProbe> {
  const ctl = AbortSignal.timeout(LINK_TIMEOUT_MS);
  try {
    /*
     * **`safeFetch` 입니다 — 맨 `fetch` 가 아닙니다** (`NFR-SEC-010`).
     *
     * 여기 들어오는 `url` 은 **자료를 등록한 사람이 적은 값**이고, 이 배치는
     * 그것을 «서버에서» 가져옵니다. 맨 `fetch` 로 두면 등록자가
     * `http://192.168.0.1/` 을 넣어 사내망을 훑을 수 있습니다 — 응답을 못 봐도
     * 「닿았는가」가 `sourceStatus` 로 화면에 그대로 나옵니다.
     *
     * `redirect: "follow"` 도 함께 사라졌습니다. 바깥 주소가 사설 IP 로
     * 튕기면 첫 검사를 통과한 뒤에 안쪽으로 들어갑니다.
     */
    const { res, finalUrl } = await safeFetch(
      url,
      { method: "GET", signal: ctl },
      SELF
    );
    if (res.status === 404 || res.status === 410) {
      await res.body?.cancel().catch(() => {});
      return { verdict: "GONE", needsRender: false };
    }
    if (!res.ok) {
      /*
       * **`5xx`·`403` 을 「죽었다」로 세지 않습니다.** 서버가 잠깐 아프거나
       * 봇을 막는 것일 수 있고, 그때 `GONE` 으로 표시하면 멀쩡한 자료에
       * 「원본 없음」이 붙습니다 — 되돌리는 사람이 아무도 없습니다.
       */
      await res.body?.cancel().catch(() => {});
      return { verdict: "MOVED", needsRender: false };
    }

    /*
     * 최종 주소가 다르면 옮겨 간 것입니다. **자동으로 고치지 않습니다** —
     * 단축 URL·추적 리다이렉트도 여기 걸리므로, 사람이 보고 판단합니다.
     */
    if (finalUrl !== url) {
      await res.body?.cancel().catch(() => {});
      return { verdict: "MOVED", needsRender: false };
    }

    /*
     * **HTML 일 때만 내용을 봅니다.**
     *
     * 아래 두 판정(제목이 «없다»고 말하는가 · 글자가 없는 껍데기인가)은
     * **문서를 전제로 합니다.** JSON API·PDF·이미지에 들이대면 「글자가
     * 적으니 죽었다」가 되어 멀쩡한 자료가 전부 `MOVED` 로 뒤집힙니다 —
     * 실제로 `/api/health` 를 링크로 둔 검증이 그렇게 깨질 뻔했습니다.
     * HTML 이 아니면 **200 은 그냥 200 입니다.**
     */
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("text/html")) {
      await res.body?.cancel().catch(() => {});
      return { verdict: "OK", needsRender: false };
    }

    const html = await peek(res);

    /*
     * **200 인데 「없다」고 적혀 있는 페이지** — 이른바 soft 404.
     * 문서 사이트가 개편되면 흔합니다. HTTP 만 보면 영영 `OK` 입니다.
     */
    if (SOFT_404.some((re) => re.test(titleOf(html)))) {
      return { verdict: "MOVED", needsRender: false };
    }

    /*
     * 글자가 거의 없으면 **아직 안 그려진 것**입니다. 여기서 `OK` 라고 하면
     * 「HTTP 가 200 이었다」를 「자료가 살아 있다」로 번역하는 것입니다 —
     * 그건 확인이 아닙니다. 브라우저로 한 번 더 봅니다.
     */
    return {
      verdict: "OK",
      needsRender: visibleTextLength(html) < PEEK_TEXT_MIN,
    };
  } catch {
    /*
     * 타임아웃 · DNS 실패 · **SSRF 가드가 거부한 내부 주소**(`UnsafeUrlError`).
     *
     * 셋 다 「지금은 확인하지 못했다」이고 `GONE` 이 아닙니다. 거부된 주소를
     * `GONE` 으로 뒀다가 되돌렸습니다 — `GONE` 은 「원본이 없어졌다」는 뜻인데
     * 우리는 그 주소를 **확인하지 않은** 것뿐입니다. 바로 위에서 「확인할 수
     * 없는 것을 죽었다고 표시하면 멀쩡한 자료에 『원본 없음』이 붙고 되돌리는
     * 사람이 아무도 없다」고 적어 둔 그 원칙입니다.
     */
    return { verdict: "MOVED", needsRender: false };
  }
}

/**
 * 2단계 — **그려 보고 판단합니다.**
 *
 * 1단계가 「200 인데 볼 것이 없다」고 한 주소만 옵니다. 브라우저 하나를
 * **배치 전체가 나눠 씁니다** — 링크마다 띄우면 한 번에 1~2초씩 붙습니다.
 */
export async function probeRendered(
  browser: Browser,
  url: string
): Promise<"OK" | "MOVED"> {
  const ctx = await browser.newContext({ locale: "ko-KR" });
  try {
    const page = await ctx.newPage();
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: LINK_TIMEOUT_MS,
    });
    // 첫 페인트 뒤에 그리는 사이트가 있어 잠깐 기다립니다
    await page.waitForTimeout(1500);

    const title = await page.title();
    if (SOFT_404.some((re) => re.test(title))) return "MOVED";

    const text = (await page.locator("body").innerText().catch(() => "")).trim();
    if (SOFT_404.some((re) => re.test(text.slice(0, 400)))) return "MOVED";

    /*
     * 다 그렸는데도 **사실상 아무것도 없으면** 확인하지 못한 것입니다.
     * 「없다」가 아니라 「모르겠다」이고, 이 시스템에서 그건 `MOVED` 입니다.
     *
     * 문턱이 낮은 이유는 위 표에 있습니다 — 여기서 틀리면 멀쩡한 자료에
     * 「확인 필요」가 붙고, 그걸 되돌리는 사람이 아무도 없습니다.
     */
    return text.length < RENDERED_TEXT_MIN ? "MOVED" : "OK";
  } catch {
    return "MOVED";
  } finally {
    await ctx.close();
  }
}

register("CHECK_LINK", async () => {
  const targets = await db.resource.findMany({
    where: { deletedAt: null, url: { not: null } },
    select: { id: true, url: true },
  });

  const counts = { OK: 0, MOVED: 0, GONE: 0 };
  const toRender: { id: string; url: string }[] = [];

  for (const t of targets) {
    const { verdict, needsRender } = await probeHttp(t.url!);
    if (needsRender) {
      // 판정을 미룹니다 — 2단계가 끝나야 무엇인지 압니다
      toRender.push({ id: t.id, url: t.url! });
      continue;
    }
    counts[verdict]++;
    await db.resource.update({
      where: { id: t.id },
      data: { sourceStatus: verdict, sourceCheckedAt: new Date() },
    });
  }

  /*
   * **브라우저는 필요할 때만 띄웁니다.** 대부분의 사이트는 1단계에서 끝납니다 —
   * 한 건도 의심스럽지 않으면 크로미움은 아예 안 뜹니다.
   */
  if (toRender.length > 0) {
    const browser = await chromium.launch({ headless: true });
    try {
      for (const t of toRender) {
        const verdict = await probeRendered(browser, t.url);
        counts[verdict]++;
        await db.resource.update({
          where: { id: t.id },
          data: { sourceStatus: verdict, sourceCheckedAt: new Date() },
        });
      }
    } finally {
      await browser.close();
    }
  }

  return { checked: targets.length, rendered: toRender.length, ...counts };
});

/* ── 일 1회: 30일 지난 휴지통 정리 ────────────────────────────────── */

/** 소프트 삭제 유예 (`FR-RES-007`) */
const TRASH_DAYS = 30;

register("CLEANUP_TRASH", async () => {
  const cutoff = new Date(Date.now() - TRASH_DAYS * 24 * 60 * 60 * 1000);
  const targets = await db.resource.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true, title: true },
  });
  if (targets.length === 0) return { purged: 0 };

  /*
   * **`resource.service.purge` 를 부르지 않습니다.** 그 함수는 `ADMIN` 액터를
   * 요구하는데(되돌릴 수 없는 조작이라 그렇습니다), 여기에는 사람이 없습니다.
   * 가짜 관리자 액터를 만들어 넘기면 **감사 로그에 없는 사람이 찍힙니다.**
   *
   * 대신 같은 일을 여기서 합니다 — 파일 키를 모아 두고, 행을 지우고,
   * 커밋 뒤 디스크를 정리하고, **행위자 없는 기록**을 남깁니다.
   */
  const staleKeys: string[] = [];
  let purged = 0;

  for (const t of targets) {
    await db.$transaction(async (tx) => {
      const links = await tx.resourceFile.findMany({
        where: { resourceId: t.id },
        select: {
          file: {
            select: {
              id: true,
              storageKey: true,
              _count: { select: { resources: true } },
            },
          },
        },
      });
      // 다른 자료도 쓰는 파일은 남깁니다 (`resource.service.purge` 와 같은 규칙)
      const orphans = links.filter((l) => l.file._count.resources <= 1);
      for (const l of orphans) staleKeys.push(l.file.storageKey);

      await tx.file.deleteMany({
        where: { id: { in: orphans.map((l) => l.file.id) } },
      });
      await tx.resource.delete({ where: { id: t.id } });
    });
    purged++;
  }

  for (const key of staleKeys) {
    await storage.remove(key).catch((e: unknown) => {
      console.error("[cleanup] 파일 삭제 실패 — 고아 파일이 남습니다:", key, e);
    });
  }

  /*
   * **한 줄로 남깁니다.** 200건을 지웠다고 감사 로그에 200줄을 넣으면
   * 그날의 다른 기록이 전부 밀려납니다. 무엇을 지웠는지는 제목 목록으로.
   */
  await db.auditLog.create({
    data: {
      via: "WEB",
      action: "RESOURCE_PURGE",
      targetType: "resource",
      summary: `휴지통 자동 정리 — ${purged}건 (삭제 후 ${TRASH_DAYS}일 경과)`,
      diff: {
        titles: {
          before: "-",
          after: targets
            .slice(0, 20)
            .map((t) => t.title)
            .join(", "),
        },
      },
    },
  });

  return { purged, files: staleKeys.length };
});
