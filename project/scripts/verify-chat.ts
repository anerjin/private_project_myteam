/**
 * 도우미 채팅 검증 — **모델이 뭘 쥐고 있는지 CLI 에게 묻는다.**
 *
 *   npm run verify:chat
 *
 * ## 이 검사가 왜 생겼는가
 *
 * 운영자가 채팅에 「공간정보 저장소를 찾아줘」라고 물었더니 **사내 자료가
 * 아니라 바깥 저장소 목록**이 나왔습니다. 링크도 없었습니다. 이 채팅은
 * 사내 전용인데 바깥을 보고 있었습니다.
 *
 * 원인은 `chat.service.ts` 의 주석이 **코드에 없는 성질을 주장한 것**이었습니다:
 *
 * > | `--allowedTools` (읽기만) | 자료를 **고치거나 지우지 못합니다** |
 *
 * `--restricted` 는 「명령·코드를 **실행**하는」 도구만 없애고,
 * `--allowedTools` 는 「물어보지 않고 허용할 것」 목록입니다. 둘 다
 * **「이것만 있다」가 아닙니다.** 실제로는 `WebSearch`·`Write`·`Task` 와
 * `queenbee_create_resource` 까지 손에 쥐고 있었습니다.
 *
 * ## 그래서 「막았다」를 믿지 않습니다
 *
 * 막는 목록(`DENIED_TOOLS`)은 **낡습니다** — CLI 를 올리면 새 도구가 조용히
 * 늘어나고, 그 도구는 아무도 막은 적이 없습니다. 그래서 여기서는 목록을
 * 읽지 않고 **CLI 를 띄워 `init` 이 부르는 도구 이름을 받습니다.**
 *
 * 모델에게는 아무것도 묻지 않으므로(`init` 뒤에 바로 죽입니다) 구독
 * 사용량을 쓰지 않습니다.
 */
import { createHash, randomUUID } from "node:crypto";

import { ASSISTANT } from "@/features/chat/assistant";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import * as chat from "@/server/services/chat.service";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(
    `${ok ? "  OK  " : "  실패"} ${label}${detail ? " — " + detail : ""}`
  );
  if (ok) pass++;
  else fail++;
}

/** 이름에 이게 들어 있으면 바깥으로 나가거나 이 PC 를 만지는 도구다 */
const FORBIDDEN = [
  "Web",
  "Bash",
  "Write",
  "Edit",
  "Read",
  "Glob",
  "Grep",
  "Task",
  "Agent",
  "Skill",
  "Cron",
  "Send",
  "Push",
  "Artifact",
  "Worktree",
  "create_resource",
  "update_resource",
  "archive_github",
];

async function main() {
  console.log("\n★ 채팅 — 사내 전용인가");

  check("CLI 를 찾는다", chat.isAvailable());
  if (!chat.isAvailable()) {
    console.log("\n  CLI 가 없어 나머지를 건너뜁니다.");
    return;
  }

  const configured = chat.toolsConfigured();
  check("CHAT_API_KEY 가 있다", configured, configured ? "" : "없으면 검색이 꺼집니다");

  /*
   * **모델이 쥔 것을 CLI 에게 묻습니다.** 여기가 이 스크립트의 전부입니다 —
   * 나머지는 그 목록을 읽는 방법일 뿐입니다.
   */
  const tools = await chat.listTools();
  console.log(`  (CLI 가 답한 도구 ${tools.length}개: ${tools.join(", ")})`);

  const leaked = tools.filter((t) =>
    FORBIDDEN.some((f) => t.toLowerCase().includes(f.toLowerCase()))
  );
  check(
    "바깥으로 나가거나 이 PC 를 만지는 도구가 없다",
    leaked.length === 0,
    leaked.length ? `새어 나온 것: ${leaked.join(", ")}` : "WebSearch 포함"
  );

  const unexpected = tools.filter((t) => !chat.EXPECTED_TOOLS.includes(t));
  check(
    "기대한 목록 밖의 도구가 없다",
    unexpected.length === 0,
    unexpected.length
      ? `CLI 가 새 도구를 들여왔습니다: ${unexpected.join(", ")} — DENIED_TOOLS 를 보십시오`
      : ""
  );

  if (configured) {
    for (const want of chat.EXPECTED_TOOLS) {
      if (want === "ToolSearch") continue;
      check(`«${want.replace("mcp__queenbee__queenbee_", "")}» 를 쓸 수 있다`, tools.includes(want));
    }
  }

  /*
   * **두 번째 자물쇠.** 도구를 지우는 것은 CLI 의 성질에 기대는 일이고,
   * CLI 는 우리 것이 아닙니다. 키 스코프는 우리 것입니다 — 쓰기 도구를
   * 어떻게든 불러도 API 가 403 을 줍니다 (`DEC-037`).
   */
  const key = env.CHAT_API_KEY
    ? await db.apiKey.findUnique({
        where: {
          keyHash: createHash("sha256").update(env.CHAT_API_KEY).digest("hex"),
        },
        select: { scopes: true, revokedAt: true, expiresAt: true },
      })
    : null;

  check("CHAT_API_KEY 가 DB 에 있다", key !== null);
  if (key) {
    check("살아 있는 키다", key.revokedAt === null && key.expiresAt > new Date());
    check(
      "읽기 스코프뿐이다",
      key.scopes.length === 1 && key.scopes[0] === "resources:read",
      key.scopes.join(",")
    );
  }

  /*
   * 프롬프트가 「안에 있는 것만」이라고 말하는가. 문구가 사라지면 모델이
   * 다시 바깥을 뒤집니다 — 도구를 막아도 **자기가 아는 것을 늘어놓는** 길은
   * 남아 있고, 그건 프롬프트로만 막힙니다.
   */
  const prompt = chat.systemPromptFor("자료 목록");
  /*
   * 이름은 화면과 프롬프트가 **같은 값**을 써야 합니다. 패널이 「디오」라고
   * 부르는데 본인이 「저는 도우미입니다」라고 하면 같은 것으로 안 보입니다.
   */
  check(
    `프롬프트가 이름을 «${ASSISTANT}»로 준다`,
    prompt.includes(`«${ASSISTANT}»`),
    "화면과 같은 이름이어야 한다"
  );
  check("프롬프트가 «등록된 자료»로 한정한다", prompt.includes("QueenBee 에 등록된 자료"));
  check(
    "빈손을 바깥 지식으로 채우지 말라고 한다",
    prompt.includes("빈손을 바깥 지식으로 채우지 마십시오")
  );
  check(
    "찾은 자료를 링크로 주라고 한다",
    prompt.includes("하나도 빠짐없이 링크로"),
    "제목만 늘어놓으면 그 자료로 갈 수가 없다"
  );
  check(
    "제목 모양을 정해 준다",
    prompt.includes("「이름 — 무엇인지 한 줄」"),
    "이름만 적으면 목록에서 무엇인지 모른다"
  );

  /*
   * MCP 검색이 `APP_URL` 로 주소를 만듭니다. 그게 `localhost` 라서 사내망으로
   * 들어온 팀원에게는 **자기 PC 를 가리키는 죽은 링크**가 갔습니다.
   */
  const origin = env.APP_URL.replace(/\/+$/, "");
  const sample = `자료: ${origin}/resources/github-repo/gdal 를 보세요.`;
  check(
    "우리 주소는 상대 경로로 바뀐다",
    chat.toRelativeLinksForTest(sample) === "자료: /resources/github-repo/gdal 를 보세요.",
    chat.toRelativeLinksForTest(sample)
  );
  check(
    "바깥 주소는 건드리지 않는다",
    chat.toRelativeLinksForTest("https://github.com/OSGeo/gdal") ===
      "https://github.com/OSGeo/gdal"
  );

  /*
   * **사라진 대화를 이어 달라고 하면.**
   *
   * 말풍선을 브라우저에 저장하면서 `sessionId` 가 며칠씩 살아남게 됐습니다.
   * CLI 의 대화 기록은 이 PC 의 `~/.claude` 에 있고 지워질 수 있는데, 그때
   * CLI 는 exit 1 로 「No conversation found」를 냅니다. 받아 주지 않으면
   * **한 번 지워진 뒤로 그 사람의 채팅이 영영 안 됩니다.**
   *
   * > 이 검사만 **모델을 실제로 부릅니다**(약 7초, 구독 사용량 한 번).
   * > 재시도 경로는 부르지 않고는 증명할 방법이 없습니다 — E2E 에 넣지 않고
   * > 여기 둔 이유입니다.
   */
  if (configured) {
    const dead = randomUUID();
    const r = await chat.ask("안녕", "자료 목록", dead).catch((e) => e);
    check(
      "없는 세션을 이어 달라 해도 죽지 않는다",
      typeof r?.reply === "string" && r.reply.length > 0,
      r instanceof Error ? r.message : `${r?.reply?.slice(0, 30)}…`
    );
    check(
      "«이어붙이지 못했다»고 알린다",
      r?.resumed === false,
      "화면이 그 말을 해야 «왜 갑자기 모르지»로 안 헤맨다"
    );
  }
}

main()
  .then(async () => {
    console.log(`\n합계: 통과 ${pass} · 실패 ${fail}`);
    await db.$disconnect();
    process.exit(fail === 0 ? 0 : 1);
  })
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
