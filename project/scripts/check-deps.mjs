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
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

// URL.pathname 을 직접 자르면 Windows 드라이브 문자와 경로 안의 공백(%20)에서 깨진다.
// 변환은 fileURLToPath 에 맡긴다.
const SRC = fileURLToPath(new URL("../src/", import.meta.url));

/** import 대상이 어느 계층인지 판정한다. 별칭(`@/x`)과 상대 경로를 모두 본다. */
function layerOf(spec, fromLayer) {
  if (spec.startsWith("@/")) return spec.slice(2).split("/")[0];
  // 상대 경로는 같은 폴더 안(`./`)만 허용하므로 계층이 바뀌지 않는다.
  if (spec.startsWith(".")) return fromLayer;
  return null; // 외부 패키지
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

const violations = [];

for await (const file of walk(SRC)) {
  const rel = relative(SRC, file).split(sep).join("/");
  const fromLayer = rel.split("/")[0];
  const code = readFileSync(file, "utf8");

  for (const spec of importsOf(code)) {
    const toLayer = layerOf(spec, fromLayer);
    if (!toLayer) continue;

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
      const toFeature = spec.slice("@/features/".length).split("/")[0];
      if (spec.startsWith("@/features/") && fromFeature !== toFeature) {
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
