#!/usr/bin/env node
/**
 * 의존 방향 검사 (DEV-06 · 6.9절, NFR-MAINT-002).
 *
 * 규약을 문서로만 두면 지켜지지 않습니다. 위반 0건을 CI 게이트로 둡니다.
 * 라이브러리를 쓰지 않는 이유: 검사할 규칙이 8개뿐이고, 규칙을 읽는 사람이
 * 이 파일 하나만 보면 되는 편이 낫습니다.
 *
 *   node scripts/check-deps.mjs
 */

import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

// URL.pathname 을 직접 자르면 Windows 드라이브 문자와 경로 안의 공백(%20)에서 깨진다.
// 변환은 fileURLToPath 에 맡긴다.
const SRC = fileURLToPath(new URL("../src/", import.meta.url));

/**
 * import 대상이 어느 계층인지 판정한다. 별칭(`@/x`)과 상대 경로를 모두 본다.
 *
 * **상대 경로를 «같은 계층」으로 넘겨짚지 않습니다.** 전에는 `.` 으로 시작하면
 * 무조건 출발 계층을 돌려줬는데, 그러면 `../../server/db` 한 줄로 **FORBIDDEN 규칙
 * 전체가 우회**됐습니다. 「`./` 만 쓴다」는 규약이 있어도 **아무도 그것을 강제하지
 * 않았습니다** — 검사기가 규약을 믿으면 검사기가 아닙니다. 실제 경로로 정규화합니다.
 *
 * @param fromRel `src` 기준 상대 경로 (예: `features/members/components/x.tsx`)
 */
function resolveSpec(spec, fromRel) {
  if (spec.startsWith("@/")) return spec.slice(2);
  if (!spec.startsWith(".")) return null; // 외부 패키지

  const resolved = normalize(join(dirname(fromRel), spec)).split(sep).join("/");
  // `src` 밖으로 나가는 import 는 계층 규칙의 대상이 아니다
  return resolved.startsWith("..") ? null : resolved;
}

/**
 * 금지 규칙. `from` 계층이 `to` 계층을 import 하면 위반이다.
 * 사유를 함께 적어 둔다 — 위반이 났을 때 "왜 안 되는지"가 바로 보여야 고친다.
 */
const FORBIDDEN = [
  ["lib", "features", "저수준이 고수준을 알면 순환이 생긴다"],
  ["lib", "app", "위와 같음"],
  ["components", "features", "공용 UI가 도메인에 묶인다"],
  ["components", "mocks", "공용 UI가 목 데이터에 묶이면 실데이터로 못 바꾼다"],
  ["components", "server", "서버 코드가 클라이언트 번들에 섞인다"],
  ["config", "features", "메뉴 정의가 도메인을 알면 순환이 생긴다"],
  ["config", "app", "위와 같음"],
  ["types", "features", "타입이 구현을 알면 안 된다"],
];

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx|mts)$/.test(entry.name)) yield full;
  }
}

/** `export … from "x"` 인가 — 그냥 import 와 구분한다 */
function isReExport(code, spec) {
  const q = spec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\bexport\\b[\\s\\S]{0,200}?from\\s+["']${q}["']`).test(
    code
  );
}

/** `import ... from "x"` 와 `import("x")` 의 대상만 뽑는다 */
function importsOf(code) {
  const specs = [];
  const re = /(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(code)) !== null) specs.push(m[1]);
  return specs;
}

/**
 * 계층을 «질러가는» 호출 검사 (DEC-036 · DEC-044).
 *
 * 의존 «방향»은 맞는데 **거쳐야 할 함수를 건너뛰는** 위반이 있습니다.
 * P2 의 H2 가 정확히 이것이었습니다 — `auth.service` 가 `session.destroy()` 대신
 * `db.session.deleteMany` 로 질러가 캐시 정리를 빠뜨렸고, 옛 토큰이 15분 더 살았습니다.
 *
 * ## 인자를 보지 않고 **호출 위치**만 봅니다 (`DEC-044`)
 *
 * 처음에는 `update({ … status: … })` 처럼 **인자**를 봤습니다. 그 규칙은
 * 저장소에서 **정당한 작성자조차 매치하지 못했습니다** — `member.service` 가
 * `tx.user.update({ where, data })` 로 `data` 를 변수에 담기 때문입니다.
 * 「위반 0건」이 **규칙이 아무것도 보지 않아서 나온 0건**이었습니다.
 * 아래 세 형태가 전부 통과하는 것을 실제로 확인했습니다:
 *
 *   const patch = { status: "ACTIVE" }; db.user.update({ where, data: patch })
 *   db.$executeRaw`UPDATE users SET status = 'ACTIVE' …`
 *   import { db as client } from "@/lib/db"; client.user.update({ … role … })
 *
 * **인자를 보면 우회 형태가 무한하고, 위치를 보면 유한합니다.**
 * 허용 목록의 길이가 곧 「그 테이블로 가는 문의 개수」라 리뷰에서 보입니다.
 * 목록이 늘어나는 커밋은 사유를 요구하십시오.
 */
const WRITE_VERBS =
  "create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany";

/** `<무엇이든>.<모델>.<쓰기 동사>(` — 식별자 이름(`db`·`tx`·`prisma`…)에 기대지 않는다 */
const writeCall = (model) =>
  new RegExp(`\\w+\\.${model}\\.(?:${WRITE_VERBS})\\s*\\(`);

/**
 * `@/mocks` 를 읽는 파일 — **`P4` DoD 로 0이 됐고, 0으로 유지합니다.**
 *
 * 시작할 때 20개였습니다. 마지막에 폴더를 지우면 20군데가 한꺼번에 터지므로
 * 게이트를 **먼저** 켜고 목록을 줄여 나갔습니다. 정리된 항목이 목록에 남으면
 * 「남은 20개」가 영원히 20개라서, **낡은 항목도 위반으로** 잡게 했습니다.
 *
 * **폴더는 지웠습니다.** 규칙을 남겨 두는 이유는 **되돌아오는 것을 막기 위해서**입니다 —
 * 「임시로 목 하나만」이 다시 20개가 되는 길입니다.
 * 화면이 데이터를 못 구하면 목을 만들지 말고 **빈 상태를 보여주십시오**:
 * `admin/jobs` 가 그 예입니다 — 진짜 질의를 붙이니 빈 상태가 저절로 나왔고,
 * `P6` 는 화면을 건드리지 않고 워커만 붙이면 됩니다.
 */
const MOCK_DEBT = [];

/*
 * 이 규칙은 `BYPASS`(파일 내용 정규식)가 아니라 **import 루프**에 있습니다 —
 * `from "@/mocks"` 만 보면 `import { x } from "../../mocks"` 가 빠져나갑니다.
 * 실제로 그 형태를 던져서 통과하는 것을 확인하고 옮겼습니다.
 * 계층으로 판정하면 별칭이든 상대 경로든 같은 결과가 나옵니다.
 */

const BYPASS = [
  {
    pattern: writeCall("user"),
    allow: [
      // 상태·역할 전이와 비밀번호 초기화 (DEC-036)
      "server/services/member.service.ts",
      // 가입 시 생성 · lastLoginAt 갱신
      "server/repositories/user.repository.ts",
      // 본인 비밀번호 변경
      "server/services/auth.service.ts",
    ],
    why: "users 쓰기는 위 세 파일로만 한다 (DEC-036·DEC-044). status·role 을 다른 데서 바꾸면 세션 무효화가 갈라져 「정지했는데 안 끊긴다」가 된다",
  },
  {
    /*
     * `DEC-037` 이 「정지는 키를 «폐기»하지 않고 «판정»한다」로 섰으므로,
     * 다른 데서 `apiKey.update({ revokedAt })` 하는 것은 `user.update({ status })` 가
     * `DEC-036` 을 깨는 것과 **같은 방식으로** `DEC-037` 을 깹니다.
     */
    pattern: writeCall("apiKey"),
    allow: [
      "server/services/api-key.service.ts",
      // lastUsedAt 갱신 (verifyKey)
      "server/auth/api-key.ts",
    ],
    why: "api_keys 쓰기는 위 두 파일로만 한다 (DEC-037·DEC-044). 다른 데서 폐기하면 「정지는 판정」이라는 전제가 깨진다",
  },
  {
    pattern: writeCall("session"),
    allow: ["server/auth/session.ts"],
    why: "세션 쓰기는 server/auth/session.ts 의 함수로만 한다. 직접 지우면 캐시가 남아 옛 토큰이 최대 15분 더 산다 (P2 H2)",
  },
  {
    // raw 로 질러가는 길. advisory 락(`SELECT pg_advisory_xact_lock`)은 걸리지 않는다.
    pattern:
      /(?:UPDATE|DELETE\s+FROM|INSERT\s+INTO)\s+"?(?:users|sessions)"?\b/i,
    allow: [],
    why: "users·sessions 를 raw SQL 로 쓰지 않는다 (DEC-044). Prisma 를 거치지 않으면 위 규칙이 전부 무의미해진다",
  },
  {
    /*
     * 인라인 Server Action 금지 (`DEC-046`).
     *
     * `check-page-guards` 는 **page 함수만** 보므로 페이지 안에 숨은 액션의
     * 인가 검사를 **원리적으로 볼 수 없습니다.** 실제로 `/pending` 의
     * `refreshAction` 이 가드 없이 통과했습니다.
     * 함수 단위 파서를 만드는 대신 **위치를 금지하면 검사가 한 줄로 끝납니다.**
     */
    pattern: /^\s*["']use server["']/m,
    allowPrefix: "server/actions/",
    allow: [],
    why: '"use server" 는 server/actions/*.ts 안에서만 쓴다 (DEC-046). 액션은 사실상 공개 엔드포인트라 진입부 가드가 유일한 방어선인데, 다른 곳에 있으면 그것을 확인할 방법이 없다',
  },
];

const violations = [];

/** 실제로 목을 읽은 파일 — 부채 목록이 «현재»와 맞는지 대조한다 */
const mockUsers = new Set();

for await (const file of walk(SRC)) {
  const rel = relative(SRC, file).split(sep).join("/");
  const fromLayer = rel.split("/")[0];
  const code = readFileSync(file, "utf8");

  for (const rule of BYPASS) {
    if (rule.allow.includes(rel)) continue;
    if (rule.allowPrefix && rel.startsWith(rule.allowPrefix)) continue;
    if (rule.pattern.test(code)) {
      violations.push({
        file: rel,
        spec: rule.pattern.source.slice(0, 52) + "…",
        rule: `계층 우회 (허용: ${rule.allowPrefix ?? (rule.allow.length ? rule.allow.join(", ") : "없음")})`,
        why: rule.why,
      });
    }
  }

  for (const spec of importsOf(code)) {
    // 별칭이든 상대 경로든 **같은 형태로** 판정한다 — 한쪽만 보면 다른 쪽이 구멍이 된다
    const target = resolveSpec(spec, rel);
    if (!target) continue;
    const toLayer = target.split("/")[0];

    for (const [from, to, why] of FORBIDDEN) {
      if (fromLayer === from && toLayer === to) {
        violations.push({ file: rel, spec, rule: `${from} → ${to}`, why });
      }
    }

    if (toLayer === "mocks" && fromLayer !== "mocks") mockUsers.add(rel);

    // 목 데이터 부채 — 목록에 없는 파일이 새로 읽으면 위반 (P4 DoD)
    if (
      toLayer === "mocks" &&
      fromLayer !== "mocks" &&
      !MOCK_DEBT.includes(rel)
    ) {
      violations.push({
        file: rel,
        spec,
        rule: "→ mocks",
        why: "목 데이터는 P4 에서 전부 걷어냈다 (DEV-07 · 7.4 DoD). 화면이 데이터를 못 구하면 목을 만들지 말고 빈 상태를 보여줄 것 — admin/jobs 가 그 예다",
      });
    }

    /*
     * **재수출은 허용 목록을 통째로 무력화합니다.**
     *
     * 예외 목록의 파일 하나가 `export * from "@/mocks"` 하면 그것을 import 하는
     * **모든 파일이 합법**이 됩니다 — 목록이 20개인지 200개인지 알 수 없게 됩니다.
     * 실제로 던져 보고 통과하는 것을 확인한 뒤 넣은 규칙입니다.
     *
     * 목을 «쓰는» 것과 «퍼뜨리는» 것은 다릅니다. 부채 목록은 앞의 것만 허용합니다.
     */
    if (toLayer === "mocks" && fromLayer !== "mocks" && isReExport(code, spec)) {
      violations.push({
        file: rel,
        spec,
        rule: "mocks 재수출",
        why: "목을 다시 export 하면 예외 목록이 무의미해진다. 쓰는 것은 되지만 퍼뜨리는 것은 안 된다",
      });
    }

    // proxy.ts 는 server-only 모듈을 끌어오면 안 된다 (DEC-035).
    // 쿠키 이름은 lib/session-cookie.ts 에서 가져온다.
    if (rel === "proxy.ts") {
      const banned = ["server", "mocks", "features"];
      if (banned.includes(toLayer) || spec === "@/lib/env") {
        violations.push({
          file: rel,
          spec,
          rule: `proxy.ts → ${spec}`,
          why: "proxy 는 prefetch 포함 모든 라우트에서 돌고 DB·Redis 를 보면 안 된다. server-only 모듈을 그래프에 넣지 말 것 (DEC-035)",
        });
      }
    }

    /*
     * **화면은 Prisma 를 직접 부르지 않습니다** (`DEV-06 · 6.6`).
     *
     * `check-deps` 는 `action → db` 를 이미 막고 있었지만 **page 는 보고 있지
     * 않았습니다.** 그 틈으로 `admin/settings` 가 `signup.enabled` 를 직접 읽어
     * 「행이 없으면 열려 있다」를 `auth.service` 와 **따로** 판정했고,
     * `admin/jobs` 는 `take: 50` 을 화면에 박아 넣었습니다.
     *
     * 헬스 체크(`lib/db` 의 `pingDb`)는 Prisma 클라이언트가 아니라 **진단
     * 헬퍼**라 막지 않습니다 — 막는 것은 `db` 자체를 가져가는 것입니다.
     */
    if (fromLayer === "app" && /^@\/lib\/db$|(^|\/)lib\/db$/.test(spec)) {
      const named = code.match(
        new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["']${spec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`)
      );
      const brings = (named?.[1] ?? "db").split(",").map((s) => s.trim());
      if (brings.some((b) => b === "db" || b.startsWith("db "))) {
        violations.push({
          file: rel,
          spec,
          rule: `${rel} → db`,
          why: "화면이 Prisma 를 직접 부르면 조회 조건이 화면마다 갈린다. service 를 통할 것 (DEV-06 · 6.6). 진단 헬퍼(pingDb)는 허용",
        });
      }
    }

    /*
     * **반대 방향도 막습니다** — 누가 `@/proxy` 를 import 하는가.
     *
     * 위 규칙은 proxy 의 «나가는» import 만 봤습니다. 그래서 서버 컴포넌트가
     * 상수 하나(`PATHNAME_HEADER`) 때문에 `@/proxy` 를 import 해도 조용히
     * 통과했고, 그 순간 미들웨어 모듈(`next/server` · `config.matcher` ·
     * `proxy()` 본문)이 통째로 RSC 그래프에 들어왔습니다.
     *
     * `proxy.ts` 는 **라우트 진입점이지 모듈이 아닙니다** — 아무도 import 하지
     * 않아야 정상입니다. 공유할 값이 있으면 `lib/` 에 둡니다.
     */
    if (target === "proxy" || target === "proxy.ts") {
      violations.push({
        file: rel,
        spec,
        rule: `${rel} → @/proxy`,
        why: "proxy.ts 는 라우트 진입점이라 import 대상이 아니다. 공유 상수는 lib/ 에 둘 것 (선례: lib/session-cookie.ts · lib/request-headers.ts)",
      });
    }

    // features/A → features/B 금지. 같은 feature 안은 허용한다.
    if (fromLayer === "features" && toLayer === "features") {
      const fromFeature = rel.split("/")[1];
      const toFeature = target.split("/")[1];
      if (toFeature && fromFeature !== toFeature) {
        violations.push({
          file: rel,
          spec,
          rule: `features/${fromFeature} → features/${toFeature}`,
          why: "기능 간 결합. 공유가 필요하면 components/common 또는 lib 로 올리고, 조립은 app/_shell 에서 한다",
        });
      }
    }

    // 콘텐츠 타입 «폴더끼리» import 금지 (DEV-06 · 6.5절).
    // 레지스트리(`content-types/index.ts`)가 모든 타입을 import 하는 것은 그 파일의 일이므로
    // 타입 폴더 «안»에 있는 파일만 검사 대상이다.
    const ctPrefix = "features/resources/content-types/";
    const insideTypeFolder =
      rel.startsWith(ctPrefix) && rel.slice(ctPrefix.length).includes("/");
    if (insideTypeFolder && spec.includes("/content-types/")) {
      const fromType = rel.slice(ctPrefix.length).split("/")[0];
      const after = spec.split("/content-types/")[1] ?? "";
      const toType = after.split("/")[0];
      /*
       * **`content-types/` «루트»의 파일은 공용 모듈입니다** — `types.ts`·`index.ts`·
       * `operational.ts`·`schemas.ts`. 이름을 하나씩 예외 목록에 넣으면 새 공용
       * 모듈을 만들 때마다 이 검사기를 고치게 되고, 그러면 규칙이 두 곳에 생깁니다.
       * **폴더 안인지 루트인지**로 판정합니다 — 뒤에 `/` 가 있으면 타입 폴더입니다.
       */
      const toIsSharedRoot = !after.includes("/");
      if (toType && fromType !== toType && !toIsSharedRoot) {
        violations.push({
          file: rel,
          spec,
          rule: `content-types/${fromType} → content-types/${toType}`,
          why: "타입 간 결합을 막는다. 공통이 필요하면 features/resources/components 로 올린다",
        });
      }
    }
  }
}

/*
 * **정리된 파일은 목록에서 지웁니다.**
 *
 * 허용 목록은 «없는 파일」을 조용히 통과시키므로, 부채를 갚아도 목록이 그대로면
 * 「남은 20개」가 영원히 20개입니다 — 그러면 **목록이 진행률이라는 말이 거짓말**이 됩니다.
 * 정리 커밋에서 목록 한 줄을 함께 지우게 하는 것이 이 검사의 값입니다.
 */
const stale = MOCK_DEBT.filter((f) => !mockUsers.has(f));
for (const f of stale) {
  violations.push({
    file: f,
    spec: "@/mocks",
    rule: "부채 목록이 낡음",
    why: "이 파일은 더 이상 목을 읽지 않는다. scripts/check-deps.mjs 의 MOCK_DEBT 에서 지울 것 — 목록이 곧 P4 진행률이다",
  });
}

if (violations.length === 0) {
  const left = MOCK_DEBT.length;
  console.log(
    `✓ 의존 방향 위반 0건${left ? ` · 목 부채 ${left}개 남음 (P4 DoD: 0)` : " · 목 부채 0 — P4 DoD 달성"}`
  );
  process.exit(0);
}

console.error(`✗ 의존 방향 위반 ${violations.length}건\n`);
for (const v of violations) {
  console.error(`  ${v.file}`);
  console.error(`    → ${v.spec}`);
  console.error(`    ${v.rule} — ${v.why}\n`);
}
process.exit(1);
