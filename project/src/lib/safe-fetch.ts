import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * 사용자가 준 URL 을 서버가 대신 가져올 때 쓰는 `fetch` (`NFR-SEC-010` SSRF).
 *
 * ## 왜 필요한가 — 「우리는 외부 링크만 받는데요」가 통하지 않는 이유
 *
 * 자료에 `sourceUrl` 을 넣는 것은 **로그인한 사람 누구나** 할 수 있고,
 * 링크 생존 확인(월 1회)이 그것을 **서버에서** 가져옵니다. 그러면 등록자는
 * 서버가 있는 망 안쪽으로 요청을 쏠 수 있습니다 — `http://192.168.0.1/`,
 * `http://127.0.0.1:5432/`, 클라우드 메타데이터(`169.254.169.254`).
 * 응답을 못 봐도 **응답 시간과 성공 여부만으로 내부망을 훑을 수 있습니다.**
 *
 * ## 세 겹으로 막습니다
 *
 * ① **스킴** — `http`·`https` 만. `file:`·`gopher:` 는 거부.
 * ② **주소** — 호스트를 DNS 로 «풀어서» 나온 IP 를 봅니다. 이름만 보면
 *    공격자가 자기 도메인의 A 레코드를 `127.0.0.1` 로 두는 것을 못 막습니다.
 * ③ **리다이렉트** — `redirect: "manual"` 로 **한 홉씩** 다시 검사합니다.
 *    `follow` 로 두면 첫 주소만 안전하고 그 뒤는 상대가 정합니다 — 실제로
 *    이 함수가 생기기 전 `scheduled.ts` 의 링크 확인이 그 상태였습니다.
 *
 * ## 한계를 적어 둡니다
 *
 * DNS 를 두 번 봅니다(검사할 때, `fetch` 가 연결할 때). 그 사이에 레코드가
 * 바뀌면(DNS 리바인딩) 뚫립니다. 완전히 막으려면 소켓 레벨에서 붙잡아야
 * 하는데, **팀 20명·사내망**(`REQ-01 · 1.7` 「유지보수 난이도가 낮은 구조를
 * 우선한다」)에 그 복잡도를 들일 자리가 아닙니다. 여기서 막는 것은
 * **등록자가 URL 하나로 내부망을 훑는 것**이고, 그건 세 겹으로 충분합니다.
 */

/** 「이 주소로는 안 나갑니다」 — 네트워크 오류와 구별하려고 따로 둡니다 */
export class UnsafeUrlError extends Error {
  constructor(reason: string) {
    super(`이 주소로는 요청할 수 없습니다 — ${reason}`);
    this.name = "UnsafeUrlError";
  }
}

/**
 * 사설·예약 IPv4.
 *
 * `NFR-SEC-010` 이 이름 붙인 다섯(`10.`·`172.16.`·`192.168.`·`127.`·`169.254.`)에
 * **0.0.0.0/8**(자기 자신), **100.64/10**(통신사 NAT), **192.0.0.0/24**,
 * **198.18/15**(벤치마크), **멀티캐스트·브로드캐스트**를 더했습니다 —
 * 요구사항이 다섯만 적었다고 나머지가 안전한 것은 아닙니다.
 */
function isPrivateV4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // 못 읽으면 막는다
  }
  const [a, b] = p as [number, number, number, number];
  if (a === 0 || a === 127) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true; // 멀티캐스트 · 예약 · 브로드캐스트
  return false;
}

/** 루프백(`::1`) · 유니크 로컬(`fc00::/7`) · 링크 로컬(`fe80::/10`) · v4 매핑 */
function isPrivateV6(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0]!;
  if (v === "::" || v === "::1") return true;
  // `::ffff:127.0.0.1` 같은 v4 매핑은 v4 규칙으로 판정한다
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return isPrivateV4(mapped[1]!);
  const head = v.split(":")[0] ?? "";
  if (/^f[cd]/.test(head)) return true; // fc00::/7
  if (/^fe[89ab]/.test(head)) return true; // fe80::/10
  return false;
}

function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPrivateV4(ip);
  if (kind === 6) return isPrivateV6(ip);
  return true; // IP 로 안 읽히면 막는다
}

/**
 * 한 URL 이 «바깥»을 가리키는지 확인한다. 아니면 던진다.
 *
 * 검사만 필요할 때(등록 시점 거부) 따로 부를 수 있게 내보냅니다.
 */
export async function assertPublicUrl(
  raw: string,
  /**
   * 이 오리진들은 사설 주소여도 통과합니다.
   *
   * **쓰이는 곳은 하나 — 우리 앱 자신(`APP_URL`)입니다.** 1단계 주소가
   * `http://localhost:3100`, 사내망을 열면 `http://192.168.x.x:3100` 이라
   * 가드에 그대로 걸립니다.
   *
   * **여는 것이 아무 능력도 더하지 않습니다.** 이 fetch 는 쿠키 없이 나가므로
   * 「로그인 안 한 사람이 우리 앱을 부르는 것」과 같고, 그건 등록자가 이미
   * 브라우저로 할 수 있는 일입니다. 오리진 **하나**만 여는 것이 중요합니다 —
   * 호스트가 아니라 «호스트:포트»라서, 같은 PC 의 `localhost:5432`(Postgres)는
   * 그대로 막힙니다.
   */
  allowOrigins: readonly string[] = []
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("주소 형식이 아닙니다");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError(`${url.protocol} 은 쓸 수 없습니다`);
  }

  if (allowOrigins.includes(url.origin)) return url;

  const host = url.hostname.replace(/^\[|\]$/g, "");

  /*
   * **이름부터 막습니다.** `localhost` 는 DNS 를 안 타고 hosts 파일로
   * 풀리는 환경이 있어, 아래 조회에 맡기면 시스템마다 결과가 달라집니다.
   */
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new UnsafeUrlError("내부 주소입니다");
  }

  // 이미 IP 로 적혀 있으면 조회 없이 판정
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new UnsafeUrlError("내부 주소입니다");
    return url;
  }

  /*
   * **이름을 «풀어서» 봅니다.** 이름만 보면 공격자가 자기 도메인의
   * A 레코드를 `127.0.0.1` 로 두는 것을 못 막습니다. `all: true` 라
   * 하나라도 사설이면 거부합니다 — 라운드로빈으로 섞어 두는 수법이 있습니다.
   */
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new UnsafeUrlError("주소를 찾을 수 없습니다");
  }
  if (addrs.length === 0) throw new UnsafeUrlError("주소를 찾을 수 없습니다");
  for (const a of addrs) {
    if (isPrivateAddress(a.address)) {
      throw new UnsafeUrlError("내부 주소로 연결됩니다");
    }
  }

  return url;
}

/** 리다이렉트를 이만큼만 따라갑니다 — 무한 루프와 리다이렉트 체인 낭비를 막습니다 */
const MAX_HOPS = 5;

/**
 * 검사를 통과한 주소로만 나가는 `fetch`.
 *
 * **`redirect: "manual"` 입니다.** 홉마다 다시 검사해야 하기 때문입니다 —
 * `follow` 로 두면 첫 주소만 우리가 정하고 그 뒤는 상대가 정합니다.
 * 최종 `Response` 의 `url` 은 `fetch` 가 채우지 않으므로, 어디까지 갔는지는
 * `finalUrl` 로 돌려줍니다.
 */
export async function safeFetch(
  raw: string,
  init: RequestInit = {},
  /** `assertPublicUrl` 과 같은 뜻 — **홉마다** 다시 적용됩니다 */
  allowOrigins: readonly string[] = []
): Promise<{ res: Response; finalUrl: string }> {
  let current = raw;

  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const url = await assertPublicUrl(current, allowOrigins);
    const res = await fetch(url, { ...init, redirect: "manual" });

    const isRedirect = res.status >= 300 && res.status < 400;
    const location = res.headers.get("location");
    if (!isRedirect || !location) {
      return { res, finalUrl: current };
    }

    // 본문을 버려야 소켓이 풀립니다 — 안 하면 연결이 쌓입니다
    await res.body?.cancel();
    current = new URL(location, current).toString();
  }

  throw new UnsafeUrlError(`리다이렉트가 ${MAX_HOPS}번을 넘었습니다`);
}
