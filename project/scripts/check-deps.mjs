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
      const toType = spec.split("/content-types/")[1]?.split("/")[0];
      if (
        toType &&
        fromType !== toType &&
        toType !== "index" &&
        toType !== "types"
      ) {
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

if (violations.length === 0) {
  console.log("✓ 의존 방향 위반 0건");
  process.exit(0);
}

console.error(`✗ 의존 방향 위반 ${violations.length}건\n`);
for (const v of violations) {
  console.error(`  ${v.file}`);
  console.error(`    → ${v.spec}`);
  console.error(`    ${v.rule} — ${v.why}\n`);
}
process.exit(1);
