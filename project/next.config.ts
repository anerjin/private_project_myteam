import type { NextConfig } from "next";

/**
 * **보안 헤더는 여기가 아니라 `src/proxy.ts` 에 있습니다** (`NFR-SEC-014`).
 *
 * CSP 에 요청마다 새 nonce 가 들어가야 하는데, `headers()` 는 빌드 시점에
 * 고정된 값만 낼 수 있습니다. 한 사실을 두 곳에 두지 않으려고 네 헤더를
 * 전부 proxy 에 모았습니다 — 여기에 하나라도 옮기면 «어느 쪽이 이기는지»를
 * 매번 확인해야 합니다.
 */
const nextConfig: NextConfig = {
  /*
   * `X-Powered-By: Next.js` 를 끕니다 (`NFR-SEC-016` — 내부 사정 노출 금지).
   * 버전까지 나가지는 않지만, 스택을 알려 주면 알려진 취약점부터 찔러 봅니다.
   */
  poweredByHeader: false,
};

export default nextConfig;
