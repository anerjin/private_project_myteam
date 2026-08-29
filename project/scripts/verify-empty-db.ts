/**
 * **「목 제거」의 확인하는 법** — P4 리뷰 ④ (`DEC-032` 계열).
 *
 *   npm run dev            (다른 터미널)
 *   npx tsx --conditions=react-server --env-file=.env scripts/verify-empty-db.ts
 *
 * ## 「`@/mocks` import 가 0인가」로는 부족합니다
 *
 * `src/mocks/` 를 지우고 `check-deps` 가 「목 부채 0」이라고 셌지만, 그 게이트가
 * 센 것은 **import 형태**였습니다. 같은 시각 `admin/taxonomy/page.tsx` 안에는
 * `SUBCATEGORIES` 상수가, `config/site.ts` 에는 `CATEGORIES` 배열이 그대로
 * 있었습니다 — **목은 죽지 않고 화면 파일로 이사했습니다.**
 *
 * 정규식으로 잡으려 하면(「page 에 객체 리터럴 금지」) `metadata`·설정 상수까지
 * 걸려 오탐이 나고, 오탐이 나는 게이트는 예외 목록이 커지다 무의미해집니다
 * (`DEC-044` 가 실제로 겪은 경로입니다).
 *
 * > **그래서 문법이 아니라 «성질»을 봅니다: 데이터를 치우면 화면도 비는가.**
 * > 실제로 HTTP 로 렌더해 **나온 HTML** 을 봅니다 — 상수든 리터럴이든 다른
 * > 파일에서 온 배열이든, DB 에서 오지 않으면 화면에 그대로 남아 걸립니다.
 * >
 * > 처음엔 여기에 「`SUBCATEGORIES` 라는 낱말이 소스에 있는가」를 함께 넣었는데
 * > **제가 그 이름을 설명하는 주석에 걸려 오탐이 났습니다.** 경고받은 바로 그
 * > 경로였고, 그래서 뺐습니다. 성질 검사 하나면 됩니다.
 *
 * ## 지우지 않고 **끕니다**
 *
 * `categories` 를 `deleteMany` 하면 실데이터가 날아가고 `resources.category_id`
 * 까지 끊어야 합니다. `isActive: false` 로 내리면 `listTree` 의 필터에 그대로
 * 걸려 **같은 것을 증명하면서 되돌리기가 한 줄**입니다.
 */
import { db } from "@/lib/db";
import { hashPassword } from "@/server/auth/password";
import { issue } from "@/server/auth/session";

const BASE = "http://localhost:3100";
const COOKIE = process.env.SESSION_COOKIE_NAME || "qb_session";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(
    `${ok ? "  OK  " : "  실패"} ${label}${detail ? " — " + detail : ""}`
  );
  if (ok) pass++;
  else fail++;
}

async function get(path: string, cookie: string) {
  const res = await fetch(BASE + path, {
    headers: { cookie },
    redirect: "manual",
  });
  const raw = res.status === 200 ? await res.text() : "";
  // React 의 텍스트 구분자를 지운다 (verify-p3 와 같은 이유)
  return { status: res.status, body: raw.replaceAll("<!-- -->", "") };
}

async function run() {
  const admin = await db.user.create({
    data: {
      username: `vempty_${Date.now().toString(36)}`,
      passwordHash: await hashPassword("Verify!12345"),
      name: "빈DB검증",
      status: "ACTIVE",
      role: "ADMIN",
    },
    select: { id: true },
  });
  const { token } = await issue(admin.id, { userAgent: "verify-empty-db" });
  const cookie = `${COOKIE}=${token}`;

  /**
   * 하드코딩이었을 때 화면에 «항상» 있던 이름들.
   *
   * **이 화면의 다른 곳에 안 나오는 낱말이어야 합니다.** 처음엔 「규약」을
   * 넣었는데 같은 페이지의 «콘텐츠 타입» 탭에 `DEV_NOTE` 설명
   * *"사내 규약 · 팁 · 트러블슈팅 기록"* 이 있어서, 카테고리를 다 껐는데도
   * 그 낱말이 남아 **코드는 맞는데 검사가 틀리는** 상태가 됐습니다 —
   * `verify-p3` 에서 React 의 `<!-- -->` 때문에 겪은 것과 같은 부류입니다.
   */
  const HARDCODED_LABELS = ["LLM", "포인트클라우드", "프론트엔드"];
  /** 하드코딩 목록과 DB 의 slug 가 어긋났던 자리 (`internal` 의 하위) */
  const DB_ONLY_LABELS = ["온보딩", "회고"];

  console.log("\n★ 지금 — 화면이 DB 의 하위분류를 그린다");
  const before = await get("/admin/taxonomy", cookie);
  check("관리자로 화면이 열린다", before.status === 200, `HTTP ${before.status}`);
  for (const label of HARDCODED_LABELS) {
    check(`«${label}» 이 화면에 있다`, before.body.includes(label));
  }
  /*
   * **하드코딩과 DB 가 어긋나 있었습니다.** 화면은 `내부`의 하위를
   * `규약·온보딩·회고` 라고 그렸는데 DB 의 slug 는 `convention`·`onboarding`·
   * `retro` 였습니다 — 화면에서 본 이름으로 필터를 걸면 0건이었습니다.
   * 지금은 이름도 DB 에서 오므로 둘이 같은 행을 가리킵니다.
   */
  for (const label of DB_ONLY_LABELS) {
    check(`«${label}» 도 DB 에서 온다`, before.body.includes(label));
  }

  console.log("\n★ 카테고리를 끄면 — 화면도 빈다");
  const active = await db.category.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  try {
    await db.category.updateMany({ data: { isActive: false } });

    const empty = await get("/admin/taxonomy", cookie);
    check("화면은 그대로 열린다", empty.status === 200, `HTTP ${empty.status}`);
    check(
      "빈 상태 문구가 나온다",
      empty.body.includes("등록된 카테고리가 없습니다"),
      "이 문구가 없으면 데이터가 DB 에서 오지 않는 것이다"
    );
    for (const label of [...HARDCODED_LABELS, ...DB_ONLY_LABELS]) {
      check(
        `«${label}» 이 화면에서 사라졌다`,
        !empty.body.includes(label),
        "남아 있으면 그 값은 DB 가 아니라 코드에서 온다"
      );
    }

    /*
     * **폼도 같이 봅니다.** 관리 화면만 고쳐 두면 등록 폼이 여전히 코드에서
     * 읽고 있을 수 있고, 그때는 사용자가 고른 분류가 저장에서 **오류 없이
     * 사라집니다** (`write` 는 slug 로 행을 찾아 못 찾으면 `null` 을 넣습니다).
     */
    const form = await get("/resources/new?type=AI_MATERIAL", cookie);
    check("등록 폼이 열린다", form.status === 200, `HTTP ${form.status}`);
    for (const label of HARDCODED_LABELS) {
      check(
        `폼의 «${label}» 선택지도 사라졌다`,
        !form.body.includes(label),
        "폼이 코드에서 카테고리를 읽고 있다"
      );
    }
  } finally {
    // 어떤 경우에도 되돌린다
    await db.category.updateMany({
      where: { id: { in: active.map((c) => c.id) } },
      data: { isActive: true },
    });
  }

  console.log("\n★ 되돌아왔다");
  const after = await get("/admin/taxonomy", cookie);
  for (const label of HARDCODED_LABELS) {
    check(`«${label}» 이 다시 보인다`, after.body.includes(label));
  }
  const restored = await db.category.count({ where: { isActive: true } });
  check(
    "활성 카테고리 수가 그대로",
    restored === active.length,
    `${restored}/${active.length}`
  );

  await db.session.deleteMany({ where: { userId: admin.id } });
  await db.user.delete({ where: { id: admin.id } });

  console.log(`\n합계: 통과 ${pass} · 실패 ${fail}`);
}

/*
 * **성공해도 «끝냅니다».**
 *
 * 전에는 `fail > 0` 일 때만 `process.exit` 를 불렀습니다. 통과하면 합계까지
 * 찍고 **프로세스가 안 죽었습니다** — DB 풀이 이벤트 루프를 잡고 있어서입니다.
 * CI 에서는 이 한 줄이 「검증이 멈춘 것」과 구별되지 않고, 실제로 이전 세션이
 * 남긴 좀비 두 개를 나중에 발견했습니다. 다른 `verify:*` 는 전부
 * `finally` 에서 끝냅니다 — 이것만 빠져 있었습니다.
 */
run()
  .catch((e) => {
    console.error(e);
    fail++;
  })
  .finally(async () => {
    await db.$disconnect();
    process.exit(fail > 0 ? 1 : 0);
  });
