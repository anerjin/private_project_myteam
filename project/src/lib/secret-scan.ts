/**
 * 비밀값 유입 차단 (`NFR-SEC-008`).
 *
 * > 자료 본문·설정 JSON에 토큰 패턴(`ghp_`, `sk-`, AWS 키 등)이 감지되면
 * > 저장을 거부하고 경고
 *
 * ## 왜 service 계층에서 부르는가
 *
 * 웹 폼과 Ingest(`P7`)가 **같은 규칙**을 지나야 합니다(`NFR-SEC-018`).
 * 라우트에 두면 폼으로 붙여넣은 토큰은 그냥 저장됩니다 — 그리고 사람이
 * 붙여넣을 확률이 에이전트보다 낮지 않습니다.
 *
 * ## 길이를 반드시 붙입니다
 *
 * 지식 베이스는 **토큰 이야기를 하는 자료**를 담습니다. 「GitHub 토큰은
 * `ghp_` 로 시작한다」는 문장은 막으면 안 되고, 실제 토큰은 막아야 합니다.
 * 그래서 접두사만 보지 않고 **뒤따르는 길이**까지 봅니다. 이 구별이 없으면
 * 규칙이 자기 도메인의 자료를 거부합니다.
 *
 * ## 값을 절대 되돌려 주지 않습니다
 *
 * 잡은 것의 **종류**만 말합니다. 오류 메시지는 감사 로그·응답·화면에 남고,
 * 거기에 토큰 원문을 실으면 차단하려던 것을 스스로 흘립니다.
 */

interface Pattern {
  /** 사람에게 보여줄 이름 */
  readonly label: string;
  readonly re: RegExp;
}

const PATTERNS: readonly Pattern[] = [
  // GitHub — classic PAT(40자)·fine-grained(`github_pat_`)·OAuth/앱 토큰
  { label: "GitHub 토큰", re: /\bghp_[A-Za-z0-9]{36,}\b/ },
  { label: "GitHub 토큰", re: /\bgh[ousr]_[A-Za-z0-9]{36,}\b/ },
  { label: "GitHub 토큰", re: /\bgithub_pat_[A-Za-z0-9_]{60,}\b/ },
  // OpenAI·Anthropic
  { label: "OpenAI 키", re: /\bsk-[A-Za-z0-9_-]{32,}\b/ },
  { label: "Anthropic 키", re: /\bsk-ant-[A-Za-z0-9_-]{32,}\b/ },
  // AWS
  { label: "AWS 액세스 키", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  // Slack
  { label: "Slack 토큰", re: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  // Google API 키
  { label: "Google API 키", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  // 개인키 블록 — 길이가 아니라 «형태»가 이미 결정적입니다
  {
    label: "개인키",
    re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
  },
  /*
   * **QueenBee 자기 키.** 팀원이 MCP 설정 스니펫을 자료로 등록하다가
   * 키가 통째로 들어오는 것이 가장 그럴듯한 유출 경로입니다 (`SCR-141` 이
   * 그 스니펫을 화면에서 복사하게 만들기 때문에 더 그렇습니다).
   */
  { label: "QueenBee API 키", re: /\bqb_live_[A-Za-z0-9]{24,}\b/ },
];

/** 잡힌 종류들. 비어 있으면 깨끗하다 */
export function findSecrets(text: string): string[] {
  const hit = new Set<string>();
  for (const p of PATTERNS) {
    if (p.re.test(text)) hit.add(p.label);
  }
  return [...hit];
}

/**
 * 객체 안의 **모든 문자열**을 훑는다.
 *
 * 필드 목록을 손으로 적지 않습니다 — 타입이 늘 때마다 그 목록이 늙고,
 * 늙은 것을 알아차릴 방법이 없습니다 (`DEC-051` 이 스키마 표에서 내린 판단과
 * 같습니다). 배열·중첩 객체(`envVars` 같은 설정 JSON)도 함께 훑습니다.
 */
export function scanValues(value: unknown, acc = new Set<string>()): string[] {
  if (typeof value === "string") {
    for (const label of findSecrets(value)) acc.add(label);
  } else if (Array.isArray(value)) {
    for (const v of value) scanValues(v, acc);
  } else if (value !== null && typeof value === "object") {
    for (const v of Object.values(value)) scanValues(v, acc);
  }
  return [...acc];
}
