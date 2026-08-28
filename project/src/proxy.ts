import { NextResponse, type NextRequest } from "next/server";

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
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/pending",
  "/change-password",
  "/403",
];

function isPublic(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Server Action·폼 POST 는 통과시킨다 (위 주석). 307 리다이렉트는 메서드와 본문을
  // 유지하므로 액션 응답 자리에 HTML 이 들어가 버린다.
  if (request.method !== "GET" && request.method !== "HEAD") {
    return NextResponse.next();
  }

  // API 는 각자 인증한다. Ingest 는 API 키(server/auth/api-key.ts),
  // 나머지는 핸들러 진입부에서 DAL 을 부른다. 여기서 막으면 401 대신
  // 로그인 HTML 이 돌아가 호출자가 더 헷갈린다.
  if (pathname.startsWith("/api/")) return NextResponse.next();

  if (isPublic(pathname)) return NextResponse.next();

  const hasSession = request.cookies.has(sessionCookieName());
  if (hasSession) return NextResponse.next();

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
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // 정적 자산은 건너뛴다. 이 목록을 줄이면 proxy 커버리지가 조용히 사라지므로
    // 바꿀 때는 Server Action 경로가 빠지지 않는지 확인할 것.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)",
  ],
};
