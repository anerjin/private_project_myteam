import { networkInterfaces } from "node:os";

import type { NextConfig } from "next";

/**
 * **보안 헤더는 여기가 아니라 `src/proxy.ts` 에 있습니다** (`NFR-SEC-014`).
 *
 * CSP 에 요청마다 새 nonce 가 들어가야 하는데, `headers()` 는 빌드 시점에
 * 고정된 값만 낼 수 있습니다. 한 사실을 두 곳에 두지 않으려고 네 헤더를
 * 전부 proxy 에 모았습니다 — 여기에 하나라도 옮기면 «어느 쪽이 이기는지»를
 * 매번 확인해야 합니다.
 */

/**
 * 개발 서버에 붙어도 되는 주소 (`DEC-023` 사내망 개방).
 *
 * ## 왜 필요한가
 *
 * Next 는 **개발 모드에서** 다른 오리진이 dev 전용 자산을 가져가는 것을
 * 기본으로 막습니다. 그래서 `http://192.168.0.205:3100/login` 으로 들어가면
 * HTML 은 뜨는데 `/_next/static/chunks/*.js` 가 **403** 이 되고, 자바스크립트가
 * 하나도 안 실행됩니다 — 화면은 멀쩡해 보이는데 **아무 버튼도 안 듣습니다.**
 * 로그인이 안 된 것도 그래서였습니다.
 *
 * ## IP 를 박아 넣지 않습니다
 *
 * 사내망 IP 는 DHCP 로 바뀝니다. 박아 두면 주소가 바뀐 날 같은 증상이
 * 그대로 돌아오고, 그때는 원인을 찾는 데 또 반나절이 듭니다.
 * 대신 **이 PC 가 실제로 가진 주소**를 그때그때 읽습니다 — 어차피 그 주소로
 * 들어오는 요청은 이 컴퓨터로 오는 것입니다.
 *
 * `APP_URL` 도 함께 넣습니다. `DEC-023` 이 「사내망을 열 때 `APP_URL` 을 PC IP 로
 * 바꾼다」고 정해 두었으므로, 그 값이 곧 접속 주소입니다.
 *
 * > **운영 빌드에는 이 제한이 없습니다.** `npm run build; npm start` 로 띄우면
 * > `allowedDevOrigins` 와 무관합니다 — `DEC-023` 이 사내망 개방을 운영 빌드로
 * > 정해 둔 이유이기도 합니다. 이 설정은 **개발 중에 팀원이 붙어 볼 때**를 위한 것입니다.
 */
function devOrigins(): string[] {
  const hosts = new Set<string>();

  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      // `internal` 은 루프백입니다 — 이미 허용돼 있습니다
      if (net.family === "IPv4" && !net.internal) hosts.add(net.address);
    }
  }

  if (process.env.APP_URL) {
    try {
      hosts.add(new URL(process.env.APP_URL).hostname);
    } catch {
      // 형식이 틀린 값은 조용히 넘깁니다 — 기동을 막는 것은 `lib/env.ts` 의 몫입니다
    }
  }

  return [...hosts];
}

const nextConfig: NextConfig = {
  /*
   * `X-Powered-By: Next.js` 를 끕니다 (`NFR-SEC-016` — 내부 사정 노출 금지).
   * 버전까지 나가지는 않지만, 스택을 알려 주면 알려진 취약점부터 찔러 봅니다.
   */
  poweredByHeader: false,
  allowedDevOrigins: devOrigins(),
  /*
   * **네이티브 애드온은 번들하지 않습니다.** `sherpa-onnx-node` 는 `.node`
   * 바이너리와 DLL 을 `require` 로 찾습니다 — 번들러가 그 경로를 바꾸면
   * 「모듈을 찾을 수 없다」로 죽습니다. 서버에서 그대로 `require` 하게 둡니다
   * (`tts.service`).
   */
  serverExternalPackages: ["sherpa-onnx-node"],
};

export default nextConfig;
