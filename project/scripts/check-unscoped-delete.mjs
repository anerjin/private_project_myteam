#!/usr/bin/env node
/**
 * **조건 없는 대량 삭제**를 막는다.
 *
 *   node scripts/check-unscoped-delete.mjs
 *
 * ## 왜 생겼는가 — 운영자의 메모를 지웠습니다
 *
 * 화면을 확인하려고 만든 메모를 치운다면서 임시 스크립트에 이렇게 썼습니다:
 *
 * ```ts
 * await db.note.deleteMany({});   // ← 조건이 없습니다 (예시)
 * ```
 *
 * (위 예시는 주석이라 아래 검사에서 걸러집니다 — 자기 문서에 자기가 걸리면
 * 게이트를 못 켭니다.)
 *
 * 「내가 만든 것」이 아니라 **표 전체**입니다. 그 사이 운영자가 직접 쓴 메모가
 * 함께 지워졌고, 백업은 그 표가 생기기 **이틀 전** 것뿐이라 되돌릴 수
 * 없었습니다. 메모에는 휴지통도 없습니다(운영자가 그렇게 정했습니다).
 *
 * 「다음부터 조심한다」로는 안 됩니다 — 그 한 줄은 **짧고, 급할 때 쓰이고,
 * 리뷰를 안 지나는 임시 스크립트에** 있었습니다. 사람이 기억할 규칙이 아니라
 * 검사할 규칙입니다 (`check-page-guards` 와 같은 이유).
 *
 * ## 무엇을 잡는가
 *
 * `deleteMany()` · `deleteMany({})` — **조건 자리가 비어 있는 것**만.
 * `where` 가 있으면 통과합니다. 여러 줄에 걸쳐 쓴 것도 봅니다.
 *
 * ## 정말 전부 지워야 할 때
 *
 * 있습니다 — 시드 초기화 같은 자리입니다. 그때는 `ALLOW` 에 파일을 적습니다.
 * **적는 행위가 곧 「알고 한다」는 표시**입니다.
 */

import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIRS = ["src", "scripts", "prisma", "tests"];

/**
 * 알고 지우는 자리.
 *
 * `prisma/seed.ts` 는 **빈 DB 를 채우는 것**이고, `verify-empty-db` 는
 * 「자료가 없을 때 화면이 뭐라고 하는가」를 보는 검사라 비우는 것이 목적입니다.
 */
const ALLOW = new Set([
  "prisma/seed.ts",
  "scripts/purge-mock-data.ts",
]);

/** `deleteMany` 뒤의 괄호가 비었는가 — 공백·줄바꿈·`{}` 만 있으면 «비었다» */
const UNSCOPED = /\.deleteMany\s*\(\s*(\{\s*\})?\s*\)/;

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      yield* walk(p);
    } else if ([".ts", ".tsx", ".mts", ".mjs"].includes(extname(e.name))) {
      yield p;
    }
  }
}

const hits = [];
for (const dir of DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file).replaceAll("\\", "/");
    if (ALLOW.has(rel)) continue;
    const src = readFileSync(file, "utf8");
    if (!UNSCOPED.test(src)) continue;
    src.split("\n").forEach((line, i) => {
      const t = line.trim();
      /*
       * **주석은 넘어갑니다.** 이 규칙을 설명하는 글에 그 코드가 나옵니다 —
       * 그것까지 잡으면 규칙을 적어 둘 수가 없습니다. 실행되는 줄만 봅니다.
       */
      if (t.startsWith("*") || t.startsWith("//") || t.startsWith("/*")) return;
      if (UNSCOPED.test(line)) hits.push({ rel, line: i + 1, text: t });
    });
  }
}

if (hits.length === 0) {
  console.log("✓ 조건 없는 deleteMany 0건");
  process.exit(0);
}

console.log(`\n✗ 조건 없는 대량 삭제 ${hits.length}건`);
for (const h of hits) {
  console.log(`  ${h.rel}:${h.line}`);
  console.log(`    ${h.text}`);
}
console.log(
  "\n  `where` 로 «내가 만든 것»만 지우십시오. 정말 표 전체를 비워야 하면\n" +
    "  이 스크립트의 `ALLOW` 에 파일을 적으십시오 — 적는 행위가 「알고 한다」는 표시입니다."
);
process.exit(1);
