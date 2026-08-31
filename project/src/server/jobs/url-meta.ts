import "server-only";

import { chromium, type Browser } from "playwright";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { assertPublicUrl } from "@/lib/safe-fetch";
import { register } from "@/server/services/job.service";

/**
 * GitHub 이 아닌 자료의 메타 수집 (`FR-RES-005`, `REQ-01 · 1.2`).
 *
 * ## 이 자리는 **선언만 되어 있었습니다**
 *
 * `JobType.FETCH_URL_META` 는 스키마에 있었고 「URL 정보 수집」이라는 라벨까지
 * 붙어 있었는데, **`register` 된 처리기가 없었습니다.** 그래서 arXiv 논문·문서
 * 사이트·블로그를 등록하면 제목·요약을 아무도 안 채워 줬고, 사람이 손으로
 * 적었습니다 — `REQ-01 · 1.2` 의 「URL 하나로 등록하면 메타데이터가 자동으로
 * 채워진다」가 GitHub 에만 해당됐습니다.
 *
 * ## 왜 브라우저로 여는가 — 그리고 왜 LLM 이 아닌가
 *
 * 운영자가 「채팅으로 브라우저 제어」를 원해 `browser-use` 를 검토했는데,
 * 그건 **LLM 키가 필수**입니다(OpenAI·Anthropic·Gemini 또는 Ollama). 이 앱은
 * **모델 키를 갖지 않는 것이 설계**이고(`chat.service` — 구독 자격의 CLI 를
 * 부릅니다), 운영자도 「api 이용이 아니다」라고 못 박았습니다.
 *
 * 그리고 이 일에는 **애초에 LLM 이 필요 없습니다.** 제목·설명·저자·발행일은
 * `og:*` 와 `<meta>` 에 **구조화된 채로** 있습니다. 필요한 것은 그걸 읽는
 * 일이고, JS 로 그리는 문서 사이트 때문에 **렌더**가 필요할 뿐입니다.
 * Playwright 는 이미 이 저장소의 의존성입니다(E2E 가 씁니다).
 *
 * > 판단이 필요한 일 — 「이 사이트를 돌며 쓸 만한 걸 찾아 등록해 줘」 — 은
 * > 다른 작업이고, 거기서는 에이전트가 값을 합니다. 이 작업은 아닙니다.
 *
 * ## 사용자가 쓴 것을 덮지 않습니다
 *
 * 제목은 **절대** 안 건드립니다. 요약·저자·발행일은 **비어 있을 때만** 채웁니다
 * (`github-meta` 의 `summary` 와 같은 규칙). 기계가 사람이 쓴 문장을 지우면
 * 되돌릴 방법이 없습니다.
 */

/** 한 쪽에 이만큼. 느린 문서 사이트가 작업 큐를 붙잡지 않게 */
const TIMEOUT_MS = 25_000;
/** 요약 상한 — `resources.summary` 를 화면이 카드에 그립니다 */
const SUMMARY_MAX = 300;

export interface PageMeta {
  title: string | null;
  description: string | null;
  siteName: string | null;
  author: string | null;
  publishedAt: string | null;
}

/**
 * 렌더된 페이지에서 메타를 읽는다.
 *
 * **`domcontentloaded` 까지만 기다립니다.** `networkidle` 은 광고·분석
 * 스크립트가 계속 도는 사이트에서 영원히 안 옵니다 — 메타 태그는 `<head>` 에
 * 있어서 그때면 이미 다 있습니다.
 */
async function readMeta(browser: Browser, url: string): Promise<PageMeta> {
  const ctx = await browser.newContext({
    locale: "ko-KR",
    /*
     * **로그인한 프로필을 쓰지 않습니다.** 매번 새 컨텍스트라 쿠키가 없습니다.
     * 등록자가 적은 주소를 서버가 여는 것이므로, 그 브라우저가 운영자의
     * 로그인 세션을 들고 있으면 방문한 사이트에 그게 실려 나갑니다.
     */
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 QueenBee/1.0",
  });
  try {
    const page = await ctx.newPage();
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUT_MS,
    });

    /*
     * **`page.evaluate` 로 함수를 넘기지 않습니다.**
     *
     * 넘긴 함수는 **소스로 직렬화되어 브라우저에서** 돕니다. 그런데 `tsx`(esbuild)
     * 가 이름 있는 함수에 `__name(...)` 헬퍼를 감싸고, 그 헬퍼는 브라우저에
     * 없습니다 — `ReferenceError: __name is not defined` 로 전부 실패했습니다.
     * 빌드 도구가 무엇을 하느냐에 코드가 매달리는 자리라, **Node 쪽에서**
     * 셀렉터로 읽습니다. 왕복이 몇 번 더 늘지만 그건 지역 브라우저입니다.
     */
    const one = async (sel: string): Promise<string | null> => {
      const el = page.locator(sel).first();
      if ((await el.count()) === 0) return null;
      for (const attr of ["content", "datetime"]) {
        const v = await el.getAttribute(attr);
        if (v?.trim()) return v.trim();
      }
      const t = await el.textContent();
      return t?.trim() || null;
    };
    const pick = async (...sels: string[]): Promise<string | null> => {
      for (const s of sels) {
        const v = await one(s);
        if (v) return v;
      }
      return null;
    };

    return {
      title: await pick(
        'meta[property="og:title"]',
        'meta[name="twitter:title"]',
        'meta[name="citation_title"]',
        "title"
      ),
      description: await pick(
        'meta[property="og:description"]',
        'meta[name="description"]',
        'meta[name="twitter:description"]',
        'meta[name="citation_abstract"]'
      ),
      siteName: await pick('meta[property="og:site_name"]'),
      author: await pick(
        'meta[name="citation_author"]',
        'meta[name="author"]',
        'meta[property="article:author"]'
      ),
      publishedAt: await pick(
        'meta[property="article:published_time"]',
        'meta[name="citation_publication_date"]',
        'meta[name="date"]',
        "time[datetime]"
      ),
    };
  } finally {
    await ctx.close();
  }
}

/** `2024-03-01` · `2024/03/01` · ISO — 못 읽으면 `null` 입니다 */
function toDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw.replace(/\//g, "-"));
  if (Number.isNaN(d.getTime())) return null;
  // 앞뒤로 말이 안 되는 값은 버립니다 — 파서가 뭐든 날짜로 만들어 냅니다
  const year = d.getFullYear();
  return year >= 1990 && year <= 2100 ? d : null;
}

async function run(job: { resourceId: string | null }) {
  if (!job.resourceId) {
    throw new AppError("VALIDATION_ERROR", "자료 없이 실행할 수 없습니다.");
  }
  const resource = await db.resource.findUnique({
    where: { id: job.resourceId },
    select: { id: true, url: true, summary: true, type: true },
  });
  if (!resource?.url) {
    throw new AppError("VALIDATION_ERROR", "주소가 없는 자료입니다.");
  }

  /*
   * **SSRF 가드** (`NFR-SEC-*`). 여기 들어오는 주소는 **등록한 사람이 적은
   * 값**이고 이 작업은 그것을 서버에서 엽니다 — 맨 브라우저로 열면
   * `http://192.168.0.1/` 로 사내망을 훑을 수 있고, 그 결과가 자료의 요약으로
   * 화면에 그대로 나옵니다. `CHECK_LINK` 가 같은 이유로 `safeFetch` 를 씁니다.
   */
  /*
   * **`await` 를 빠뜨리면 가드가 «아무것도 안 합니다».**
   *
   * `assertPublicUrl` 은 이름을 DNS 로 풀어 보므로 async 입니다. `await` 없이
   * 부르면 거부가 **처리되지 않은 rejection** 이 되어 프로세스를 죽이고,
   * 그 사이 실행은 다음 줄로 넘어가 **사내 주소로 브라우저를 엽니다.**
   * 작업의 try/catch 도 못 잡습니다 — 그 promise 를 아무도 안 기다리니까요.
   * 실제로 그렇게 짰고, 사내망 주소로 시험해서 잡았습니다.
   */
  await assertPublicUrl(resource.url);

  const browser = await chromium.launch({ headless: true });
  let meta: PageMeta;
  try {
    meta = await readMeta(browser, resource.url);
  } finally {
    // **띄운 것은 치웁니다.** 실패해도 브라우저가 남으면 PC 에 쌓입니다
    await browser.close();
  }

  const filled: string[] = [];

  /*
   * **비어 있을 때만** 채웁니다. `updateMany` 의 `where` 로 조건을 걸면
   * 「읽고 판단해서 쓴다」의 경합이 없습니다 — `github-meta` 와 같은 형태입니다.
   */
  if (meta.description) {
    const { count } = await db.resource.updateMany({
      where: {
        id: resource.id,
        OR: [{ summary: null }, { summary: "" }],
      },
      data: { summary: meta.description.slice(0, SUMMARY_MAX) },
    });
    if (count > 0) filled.push("summary");
  }

  /*
   * AI 자료의 출처·저자·발행일. **타입이 다르면 건드리지 않습니다** —
   * 어느 테이블에 쓰는지는 `resource.write` 의 `DETAIL_UPSERT` 가 아는
   * 것이지만(`DEC-051`), 여기서 채우는 것은 «기계가 알아낸 값» 셋뿐이라
   * 그 표를 통째로 끌고 오지 않습니다.
   */
  if (resource.type === "AI_MATERIAL") {
    const published = toDate(meta.publishedAt);
    const data: Record<string, unknown> = {};
    if (meta.siteName) data.sourceName = meta.siteName;
    if (meta.author) data.authors = [meta.author];
    if (published) data.publishedAt = published;

    if (Object.keys(data).length > 0) {
      const cur = await db.aiMaterial.findUnique({
        where: { resourceId: resource.id },
        select: { sourceName: true, authors: true, publishedAt: true },
      });
      const patch: Record<string, unknown> = {};
      if (!cur?.sourceName && data.sourceName) patch.sourceName = data.sourceName;
      if ((cur?.authors?.length ?? 0) === 0 && data.authors) patch.authors = data.authors;
      if (!cur?.publishedAt && data.publishedAt) patch.publishedAt = data.publishedAt;

      if (Object.keys(patch).length > 0) {
        await db.aiMaterial.update({
          where: { resourceId: resource.id },
          data: patch,
        });
        filled.push(...Object.keys(patch));
      }
    }
  }

  /*
   * **채운 것이 없어도 성공입니다.** 메타가 없는 페이지는 흔하고, 그건
   * 「작업 실패」가 아니라 「가져올 것이 없었다」입니다 — 실패로 세면 관리자
   * 화면의 실패 목록이 아무 의미 없는 줄로 찹니다.
   */
  return {
    title: meta.title,
    filled,
    found: Object.values(meta).filter(Boolean).length,
  };
}

register("FETCH_URL_META", run);
