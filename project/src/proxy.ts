import { NextResponse, type NextRequest } from "next/server";

import { PATHNAME_HEADER } from "@/lib/request-headers";
import { sessionCookieName } from "@/lib/session-cookie";

/**
 * 낙관적 검사 전용 (DEC-031 · DEC-035). Next.js 16 에서 `middleware.ts` 가 개명된 것.
 *
 * **이것은 가드가 아닙니다.** 하는 일은 하나 — 세션 쿠키가 없는 요청을 보호 경로에서
 * 로그인 화면으로 돌려보내 «클릭했는데 빈 화면»을 막는 것뿐입니다.
 * 실제 인가는 `server/auth/guards.ts` 가 각 page·action 에서 판정합니다.
 *
 * **DB·Redis 를 조회하지 않습니다.** proxy 는 prefetch 를 포함해 모든 라우트에서
 * 실행되고, Next.js 공식 문서도 여기서 DB 를 보지 말라고 명시합니다.
 * 그래서 `lib/env.ts`(`server-only`) 대신 쿠키 이름 상수만 import 합니다.
 *
 * **Server Action 은 별도 라우트가 아니라 그 경로로 오는 POST 입니다.**
 * 아래 `matcher` 는 캐치올이라 액션 POST 도 덮지만 **일부러 통과시킵니다** —
 * 여기서 리다이렉트(307)하면 클라이언트가 `ActionResult` 대신 로그인 HTML 을 받아
 * 파싱에 실패하고, 「UNAUTHENTICATED」라는 깔끔한 결과 대신 정체불명의 예외가 됩니다.
 * 인가는 액션 진입부가 합니다 (`DEV-05 · 5.10`).
 */

/** 로그인하지 않아도 되는 경로 */
const PUBLIC_PATHS = ["/login", "/change-password", "/403"];

function isPublic(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * 보안 헤더 (`NFR-SEC-014`)
 * ──────────────────────────────────────────────────────────────────────── */

const isDev = process.env.NODE_ENV === "development";

/**
 * **nonce 를 씁니다 — `'unsafe-inline'` 이 아니라.**
 *
 * `script-src` 에 `'unsafe-inline'` 을 넣으면 CSP 가 막으려던 것(주입된 스크립트
 * 실행)을 그대로 허용합니다. 그러면 헤더는 있는데 **막는 것이 없습니다** —
 * 이 저장소가 반복해서 지워 온 「선언이 코드에 없는 성질을 주장하는」 형태입니다.
 *
 * 대가는 **정적 렌더 포기**입니다. Next 는 요청 헤더의 nonce 를 보고 스크립트
 * 태그에 심으므로 빌드 시점에 만들 수 없습니다. 이 앱은 빌드 결과가 이미
 * 거의 전부 `ƒ`(동적)이라 잃을 정적 페이지가 남아 있지 않습니다.
 * CDN 도 없습니다 (개발 PC 한 대, `DEC-017`).
 *
 * ## `upgrade-insecure-requests` 를 «일부러» 뺐습니다
 *
 * Next 문서 예시에는 있지만 **1단계에서는 앱을 통째로 죽입니다.** 사내망을 열면
 * 주소가 `http://192.168.x.x:3100` 이 되는데(`DEC-023`), 이 지시어는 그 오리진의
 * 하위 요청을 전부 `https` 로 올려 버립니다 — `localhost` 는 브라우저가 예외로
 * 두지만 **사설 IP 는 아닙니다.** HTTPS 로 가는 2단계(`NFR-SEC-004`)에 넣습니다.
 */
function cspFor(nonce: string): string {
  return [
    "default-src 'self'",
    // dev 는 React 가 서버 스택을 복원하려고 `eval` 을 씁니다 (Next 문서)
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    /*
     * **`style-src` 만 `'unsafe-inline'` 입니다 — 어쩔 수 없어서가 아니라
     * nonce 로는 불가능하기 때문입니다.**
     *
     * CSP 의 `style-src` 는 `<style>` 태그뿐 아니라 **`style=` 속성**까지 막는데,
     * nonce 는 태그에만 붙습니다. 속성에는 붙일 방법이 없습니다. Radix 는
     * 팝오버·드롭다운 위치를 `style` 속성으로 잡고 사이드바는 `--sidebar-width`
     * 를 그렇게 넘깁니다 — nonce 만 두면 **메뉴가 화면 구석에 쌓입니다.**
     * 실제로 운영 빌드에서 위반 6건이 났고 E2E 넷이 그 자리에서 죽었습니다.
     *
     * 스크립트와 달리 스타일 주입은 코드 실행이 아닙니다. `script-src` 는
     * nonce 를 지킵니다 — 막아야 할 것은 그쪽입니다.
     */
    "style-src 'self' 'unsafe-inline'",
    // 자료 본문의 마크다운이 외부 이미지를 겁니다 (`rehype-sanitize` 가 태그를 거름)
    "img-src 'self' blob: data: https:",
    /*
     * 네오의 목소리는 서버가 만든 WAV 를 `blob:` 으로 틉니다 (`DEC-072`).
     * `media-src` 가 없으면 `default-src 'self'` 로 떨어져 **`blob:` 이 막힙니다** —
     * 실제로 첫 재생이 CSP 위반으로 죽었습니다. 바깥 주소는 여전히 안 됩니다.
     */
    "media-src 'self' blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * 모든 응답에 같은 것을 붙인다 — **리다이렉트에도.**
 *
 * 성공 경로에만 붙이면 로그인으로 튕기는 응답이 헤더 없이 나갑니다. 「대부분의
 * 응답에 있다」는 보안 헤더로는 의미가 없습니다.
 */
function withSecurityHeaders(res: NextResponse, nonce: string): NextResponse {
  res.headers.set("Content-Security-Policy", cspFor(nonce));
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return res;
}

/**
 * 서버 컴포넌트에 **현재 경로**를 알려 준다 (`lib/request-headers.ts`).
 *
 * 전에는 빵부스러기가 **전체 자료의 slug→제목 맵**을 만들고 그중 하나를 썼습니다.
 * 1만 건이면 매 요청 1만 행입니다. 경로를 알면 **그 세그먼트만** 조회하면 됩니다.
 *
 * 헤더 «이름»은 `lib/` 에 둡니다 — 서버 컴포넌트가 상수 하나 때문에 이 파일을
 * import 하면 미들웨어 모듈이 RSC 그래프에 들어옵니다 (쿠키 이름과 같은 이유).
 */
function pass(request: NextRequest, nonce: string) {
  const headers = new Headers(request.headers);
  headers.set(PATHNAME_HEADER, request.nextUrl.pathname);
  /*
   * **요청 헤더에도 실어야 합니다.** Next 는 렌더 중에 «요청»의
   * `Content-Security-Policy` 를 파싱해 `'nonce-…'` 를 꺼내 스크립트 태그에
   * 붙입니다. 응답에만 붙이면 브라우저는 막고 Next 는 모릅니다 — 화면이
   * 하얗게 뜨고 콘솔에만 위반이 쌓입니다.
   */
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", cspFor(nonce));
  return withSecurityHeaders(
    NextResponse.next({ request: { headers } }),
    nonce
  );
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  // Server Action·폼 POST 는 통과시킨다 (위 주석). 307 리다이렉트는 메서드와 본문을
  // 유지하므로 액션 응답 자리에 HTML 이 들어가 버린다.
  if (request.method !== "GET" && request.method !== "HEAD") {
    return pass(request, nonce);
  }

  // API 는 각자 인증한다. Ingest 는 API 키(server/auth/api-key.ts),
  // 나머지는 핸들러 진입부에서 DAL 을 부른다. 여기서 막으면 401 대신
  // 로그인 HTML 이 돌아가 호출자가 더 헷갈린다.
  if (pathname.startsWith("/api/")) return pass(request, nonce);

  if (isPublic(pathname)) return pass(request, nonce);

  const hasSession = request.cookies.has(sessionCookieName());
  if (hasSession) return pass(request, nonce);

  /*
   * **단방향입니다.** «쿠키가 있으니 /login 에서 /dashboard 로» 같은 반대 방향
   * 리다이렉트를 여기에 넣으면, 관리자가 세션을 지운 사용자가 무한 루프에 빠집니다
   * (proxy: 쿠키 있음 → 대시보드 / DAL: 세션 무효 → 로그인).
   * 서버 컴포넌트 렌더 중에는 쿠키를 지울 수 없어 DAL 이 죽은 쿠키를 치울 수도 없습니다.
   * 「이미 로그인했으니 대시보드로」 판단은 `/login` page 가 DAL 로 합니다.
   */
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  // 로그인 후 원래 가려던 곳으로 돌려보낸다. 값 검증은 로그인 액션이 한다 (NFR-SEC-011).
  url.searchParams.set("next", `${pathname}${search}`);
  return withSecurityHeaders(NextResponse.redirect(url), nonce);
}

export const config = {
  matcher: [
    // 정적 자산은 건너뛴다. 이 목록을 줄이면 proxy 커버리지가 조용히 사라지므로
    // 바꿀 때는 Server Action 경로가 빠지지 않는지 확인할 것.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)",
  ],
};
