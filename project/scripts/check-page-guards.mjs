#!/usr/bin/env node
/**
 * page 인가 가드 검사 (DEC-035).
 *
 * **인가는 레이아웃이 아니라 각 `page.tsx` 가 합니다.** Next.js 16 의 Partial Rendering
 * 때문에 레이아웃은 클라이언트 네비게이션에서 재실행되지 않고, 레이아웃의 `redirect()` 는
 * page 세그먼트 렌더와 RSC Payload 를 막지 못하기 때문입니다.
 *
 * 그래서 «page 마다 DAL 을 부른다»는 **사람이 기억할 규칙이 아니라 검사할 규칙**입니다.
 * 화면 하나를 추가하며 가드를 빠뜨리면 그 화면만 조용히 뚫립니다.
 *
 *   node scripts/check-page-guards.mjs
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = fileURLToPath(new URL("../src/app/", import.meta.url));

/** 라우트 그룹별로 요구하는 가드 */
const REQUIRED = [
  { group: "(service)", guards: ["requireActiveUser", "requireRole"] },
  { group: "(admin)", guards: ["requireRole"] },
];

/**
 * 공개 화면은 제외한다. `(public)` 그룹과 오류 화면은 로그인 없이 보여야 한다.
 * `change-password` 는 `(public)` 에 있지만 **로그인은 되어 있어야** 하므로
 * 별도로 확인한다 (아래 SPECIAL).
 */
const SPECIAL = {
  "(public)/change-password/page.tsx": ["getSession", "requireActiveUser"],
  // PENDING 은 유효한 세션이지만 서비스에 못 들어온다 (DEC-040)
  "(public)/pending/page.tsx": ["requirePendingUser"],
};

function pages(dir, base = "", out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) pages(p, rel, out);
    else if (e.name === "page.tsx") out.push({ path: p, rel });
  }
  return out;
}

const missing = [];

for (const { path, rel } of pages(APP)) {
  const src = readFileSync(path, "utf8");

  const special = SPECIAL[rel.replace(/\\/g, "/")];
  if (special) {
    if (!special.some((g) => src.includes(g))) {
      missing.push({ rel, need: special.join(" 또는 ") });
    }
    continue;
  }

  const rule = REQUIRED.find((r) => rel.includes(r.group));
  if (!rule) continue;

  if (!rule.guards.some((g) => src.includes(g))) {
    missing.push({ rel, need: rule.guards.join(" 또는 ") });
  }
}

if (missing.length === 0) {
  console.log("✓ page 인가 가드 누락 0건");
  process.exit(0);
}

console.error(`✗ page 인가 가드 누락 ${missing.length}건\n`);
for (const m of missing) {
  console.error(`  ${m.rel}`);
  console.error(
    `    → ${m.need} 를 함수 첫 줄에서 호출해야 합니다 (DEC-035)\n`
  );
}
console.error(
  "레이아웃에서 막는 것은 인가가 아닙니다 — Partial Rendering 때문에 재실행이 보장되지 않고,\n" +
    "레이아웃의 redirect() 는 page 렌더와 RSC Payload 를 막지 못합니다.\n"
);
process.exit(1);
