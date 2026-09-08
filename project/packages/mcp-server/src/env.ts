/**
 * `NEOWAVE_WORK_URL` · `NEOWAVE_WORK_API_KEY` 검증 (`DEV-06 · 6.2`).
 *
 * **기동할 때 한 번 봅니다.** stdio MCP 서버는 Claude Code 가 자식 프로세스로
 * 띄우므로, 설정이 틀렸을 때 사용자가 보는 것은 「도구가 안 보인다」뿐입니다.
 * 그래서 잘못된 설정은 **도구 호출 때가 아니라 기동 때** 죽고, 죽으면서
 * 무엇을 고쳐야 하는지 stderr 로 말합니다 — stdout 은 프로토콜 전용이라
 * 여기에 사람 문구를 쓰면 대화 자체가 깨집니다.
 */

export interface Config {
  baseUrl: string;
  apiKey: string;
}

const SETUP_HINT = `
Neowave Work MCP 서버 설정이 필요합니다. Claude Code 설정에 이렇게 넣어 주세요.

  {
    "mcpServers": {
      "neowave-work": {
        "command": "npx",
        "args": ["-y", "@neowave-work/mcp"],
        "env": {
          "NEOWAVE_WORK_URL": "http://localhost:3100",
          "NEOWAVE_WORK_API_KEY": "nw_live_..."
        }
      }
    }
  }

API 키는 Neowave Work 마이페이지 > API 키에서 발급합니다.`;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const raw = env.NEOWAVE_WORK_URL?.trim();
  const apiKey = env.NEOWAVE_WORK_API_KEY?.trim();

  if (!raw) fail("NEOWAVE_WORK_URL 이 없습니다.");
  if (!apiKey) fail("NEOWAVE_WORK_API_KEY 가 없습니다.");

  let url: URL;
  try {
    url = new URL(raw!);
  } catch {
    fail(`NEOWAVE_WORK_URL 이 주소 형식이 아닙니다: ${raw}`);
  }
  if (!["http:", "https:"].includes(url!.protocol)) {
    fail(`NEOWAVE_WORK_URL 은 http/https 여야 합니다: ${raw}`);
  }

  /*
   * **키 «모양»만 봅니다.** 유효한지는 서버가 판정합니다 — 여기서 흉내 내면
   * 규칙이 두 곳에 생기고, 서버가 형식을 바꿀 때 이쪽만 늙습니다
   * (`DEV-06 · 6.2` 「비즈니스 로직을 두지 않는다」).
   */
  if (!apiKey!.startsWith("nw_")) {
    fail("NEOWAVE_WORK_API_KEY 가 Neowave Work 키 형식(nw_live_…)이 아닙니다.");
  }

  return { baseUrl: raw!.replace(/\/$/, ""), apiKey: apiKey! };
}

function fail(message: string): never {
  process.stderr.write(`[neowave-work-mcp] ${message}\n${SETUP_HINT}\n`);
  process.exit(1);
}
