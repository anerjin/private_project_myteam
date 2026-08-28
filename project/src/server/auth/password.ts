import "server-only";

import { hash, verify } from "@node-rs/argon2";

/**
 * 비밀번호 해시 (NFR-SEC-001, REQ-02 · 2.6절).
 *
 * **여기가 자체 인증에서 라이브러리를 쓰는 유일한 자리입니다** (`DEC-030`).
 * 세션은 직접 만들지만 암호 해시는 직접 만들지 않습니다.
 */

/**
 * Argon2**id**. Argon2i(부채널 내성)와 Argon2d(GPU 내성)를 섞은 것이라
 * 비밀번호 저장의 기본 선택입니다.
 *
 * **파라미터는 «권장값»이 아니라 «측정값»으로 정했습니다.** 이 PC에서 실측:
 *
 * | 설정 | 1회 |
 * | --- | --- |
 * | OWASP 하한 m=19MiB t=2 | 8ms |
 * | OWASP 권장 m=46MiB t=1 | 8ms |
 * | m=46MiB t=2 | 23ms |
 * | **m=64MiB t=3 (채택)** | **49ms** |
 *
 * 권장 하한을 그대로 쓰면 이 하드웨어에서 **8ms** 밖에 안 걸립니다. 그 정도면
 * 유출된 해시를 대입 공격으로 뚫는 비용이 너무 쌉니다. 로그인은 드문 동작이고
 * 동시 사용자가 20명(`REQ-01`)이라 **50ms 정도는 부담이 아닙니다.**
 *
 * 하드웨어가 바뀌면 다시 재서 조정하세요 — 숫자를 베끼지 말고 측정하세요.
 */
/**
 * `Algorithm` 은 ambient const enum 이라 `isolatedModules` 아래서 값으로 쓸 수 없습니다.
 * 라이브러리 정의(`@node-rs/argon2/index.d.ts`)의 `Argon2id = 2` 를 그대로 씁니다.
 * 기본값이기도 하지만 **명시합니다** — 라이브러리 기본이 바뀌어도 우리 선택은 안 바뀝니다.
 */
const ARGON2ID = 2;

const OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 65_536, // KiB = 64MiB
  timeCost: 3,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

/**
 * 비밀번호 검증.
 *
 * **해시가 깨져 있어도 던지지 않고 `false` 를 돌려줍니다.** 검증 실패와
 * 데이터 손상을 호출부가 구분할 이유가 없고, 예외가 새어 나가면
 * 「이 계정은 존재하는데 해시가 이상하다」는 정보를 흘리게 됩니다 (`NFR-SEC-016`).
 */
export async function verifyPassword(
  hashed: string,
  plain: string
): Promise<boolean> {
  try {
    return await verify(hashed, plain, OPTIONS);
  } catch {
    return false;
  }
}

/**
 * 아이디가 없을 때도 **해시 검증과 같은 시간을 쓰기 위한** 더미 검증.
 *
 * 없는 아이디는 즉시 실패하고 있는 아이디는 해시 검증(수십 ms)을 거치면,
 * 응답 시간 차이로 **아이디의 존재 여부가 새어 나갑니다.** 로그인 실패 메시지를
 * 하나로 통일해도(`REQ-02 · 2.6절`) 타이밍이 알려주면 소용이 없습니다.
 *
 * 더미 해시를 손으로 적은 상수로 박지 않는 이유: 그 문자열이 유효한 argon2 해시가
 * 아니면 `verify` 가 실제 계산 없이 돌아와 **평준화가 조용히 무너집니다.**
 * (실측해 보니 잘못된 해시는 예외도 던지지 않고 그냥 돌아옵니다 — 더 위험합니다.)
 * 진짜 해시를 한 번 만들어 두고 재사용합니다.
 */
let dummyHash: Promise<string> | null = null;

export async function burnPasswordTime(): Promise<false> {
  dummyHash ??= hash("queenbee-timing-equalizer", OPTIONS);
  await verifyPassword(await dummyHash, "wrong-on-purpose");
  return false;
}
