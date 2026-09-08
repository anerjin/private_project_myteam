/**
 * 간트 막대 색 검증 (`FR-PROJ-014` · `DEC-074`).
 *
 *   npm run check:gantt-color
 *
 * ## 이 검사가 있는 이유 — 이건 «조용히» 깨집니다
 *
 * 우리가 DB 에 넣는 것은 `"blue"` 같은 **키**이고, 그 키를 CSS 값으로 바꾸는
 * 자리는 `features/projects/gantt-color-css.ts` 하나입니다. 그 변환은 벤더가
 * `gantt-bar.tsx` 에서 내보내는 `GANTT_COLORS` 를 **그대로 가져다** 씁니다.
 *
 * 위험한 것은 **간트를 다시 받아 오는 날**입니다 (`DEC-070`: 상류 수정은 손으로
 * 가져옵니다). 벤더가 색을 하나 빼거나 이름을 바꾸면 DB 에 남은 키가 낡는데,
 * 그 사건은 화면에서 **「어떤 막대만 색이 사라졌다」로만 보입니다.** 오류도
 * 로그도 없고, 그 막대를 아무도 안 보는 동안 계속 그 상태로 있습니다.
 * 재벤더링이 곧 빨강이 되게 하는 것이 이 파일의 전부입니다.
 *
 * ## 그래서 «우리 목록끼리» 비교하지 않습니다
 *
 * 우리 상수와 우리 상수를 맞대면 아무것도 재지 않는 것입니다. 여기서는
 * **벤더 소스를 파일로 읽어** 배열 리터럴을 뜯고, 그것을 우리 키와 맞댑니다.
 * import 만으로도 값은 같지만, 소스를 읽어 두면 «우리 쪽에 팔레트를 베껴 놓고
 * import 를 지운» 갈래까지 잡힙니다.
 *
 * ## 벤더 파일은 읽기만 합니다
 *
 * `components/reui/gantt/**` 는 베어 온 코드입니다 (`DEC-070`). 여기서 하는
 * 일은 읽기뿐입니다 — 고치면 다음 재벤더링이 그 수정을 조용히 덮습니다.
 *
 * ## 왜 `--conditions=react-server` 가 없나 — 다른 `verify:*` 와 갈리는 자리
 *
 * 다른 검증들은 `server-only` 인 service 를 부르므로 그 조건이 필요합니다.
 * 이 검사는 반대로 **클라이언트 쪽 절반**(벤더 팔레트)을 부릅니다. 그 조건을
 * 주면 `react-server` 갈래가 골라져 Radix 가 로드되다 죽습니다. DB 도 HTTP 도
 * 안 쓰므로 `--env-file` 도 필요 없습니다.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { GANTT_COLORS } from "@/components/reui/gantt/gantt-bar";
import { ganttColorCss } from "@/features/projects/gantt-color-css";
import {
  GANTT_COLOR_KEYS,
  GANTT_COLOR_LABEL,
  type GanttColorKey,
} from "@/features/projects/schema";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(
    `${ok ? "  OK  " : "  실패"} ${label}${detail ? " — " + detail : ""}`
  );
  if (ok) pass++;
  else fail++;
}

const ROOT = process.cwd();
const VENDOR_BAR = join(
  ROOT,
  "src",
  "components",
  "reui",
  "gantt",
  "gantt-bar.tsx"
);
const VENDOR_RAW = readFileSync(VENDOR_BAR, "utf8");

/** 주석을 벗긴다 — 아래 「베끼지 않았다」가 설명문에 헛 걸리지 않게 */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/** 벤더 소스의 `const GANTT_COLORS … = [ … ]` 에서 `{ name, value }` 를 뜯는다 */
function vendorPalette(): { name: string; value: string }[] {
  const block =
    /const GANTT_COLORS[^=]*=\s*\[([\s\S]*?)\n\]/.exec(VENDOR_RAW)?.[1] ?? "";
  return [
    ...block.matchAll(/\{\s*name:\s*"([^"]+)",\s*value:\s*"([^"]+)"\s*\}/g),
  ].map((m) => ({ name: m[1], value: m[2] }));
}

function run() {
  console.log("\n★ 벤더 소스를 실제로 읽었나 — 양성 대조");
  /*
   * **이 절이 먼저 있어야 합니다.** 정규식이 빗나가 0건을 뜯으면 아래 비교가
   * 전부 «빈 것 대 빈 것»이 되어 **공짜로 통과합니다.** 뽑은 것이 실재하는지를
   * 먼저 세웁니다.
   */
  const parsed = vendorPalette();
  check(
    "팔레트 블록에서 열 줄을 뜯었다",
    parsed.length === 10,
    `${parsed.length}건`
  );
  check(
    "이름과 값을 «둘 다» 잡았다",
    parsed[0]?.name === "Blue" && parsed[0]?.value === "var(--color-blue-500)",
    JSON.stringify(parsed[0])
  );
  check(
    "값이 전부 CSS 변수 꼴이다",
    parsed.every((c) => /^var\(--color-[a-z]+-\d+\)$/.test(c.value))
  );
  check(
    "읽은 소스가 import 해 온 배열과 같다 — 다른 파일을 읽고 있지 않다",
    JSON.stringify(parsed) ===
      JSON.stringify(
        GANTT_COLORS.map((c) => ({ name: c.name, value: c.value }))
      )
  );

  console.log("\n★ 우리 키 ↔ 벤더 팔레트");
  const vendorNames = parsed.map((c) => c.name.toLowerCase());
  check(
    "모든 키가 벤더 이름을 소문자로 눕힌 것이다 — 순서까지",
    JSON.stringify([...GANTT_COLOR_KEYS]) === JSON.stringify(vendorNames),
    `우리 ${GANTT_COLOR_KEYS.join(",")} / 벤더 ${vendorNames.join(",")}`
  );
  const byKey = new Map(parsed.map((c) => [c.name.toLowerCase(), c.value]));
  let cssOk = true;
  for (const key of GANTT_COLOR_KEYS) {
    /*
     * **먼저 «있다»를 잽니다.** 이것이 없으면 우리 키가 벤더에서 사라진 날
     * 양쪽이 나란히 `undefined` 가 되어 값 비교가 **공짜로 통과합니다** —
     * 「둘 다 없음」과 「둘 다 같음」이 같아 보이는 자리입니다.
     */
    if (
      ganttColorCss(key) === undefined ||
      ganttColorCss(key) !== byKey.get(key)
    ) {
      cssOk = false;
      console.log(
        `       ${key}: 우리 ${ganttColorCss(key)} / 벤더 ${byKey.get(key)}`
      );
    }
  }
  check("키마다 CSS 값이 있고, 그 값이 벤더의 값이다", cssOk);
  check(
    "다른 키는 다른 값이 된다 — 아무 값이나 돌려주는 변환이 아니다",
    new Set(GANTT_COLOR_KEYS.map((k) => ganttColorCss(k))).size ===
      GANTT_COLOR_KEYS.length
  );
  check(
    "모르는 키는 undefined — 부르는 쪽이 color 칸을 아예 안 넣게",
    ganttColorCss("chartreuse" as GanttColorKey) === undefined
  );
  check(
    "대소문자가 다르면 모르는 키다 — 저장되는 것은 소문자다",
    ganttColorCss("Blue" as GanttColorKey) === undefined
  );

  console.log("\n★ 이름표 — 빠진 키가 없다");
  /*
   * 타입(`Record<GanttColorKey, string>`)이 «빠짐»은 이미 막습니다. 여기서
   * 재는 것은 타입이 못 보는 둘입니다: **빈 문자열**과 **중복**. 색을 하나
   * 늘리며 위 줄을 복사해 오면 「파랑」이 둘이 되는데, 그러면 화면 낭독기가
   * 두 단추를 같은 이름으로 부릅니다 — 글자가 없는 견본이라 그 이름이
   * 유일한 구분입니다 (`NFR-A11Y-002`).
   */
  const labels = GANTT_COLOR_KEYS.map((k) => GANTT_COLOR_LABEL[k]);
  check(
    "모든 키에 이름이 있다",
    labels.every((l) => typeof l === "string" && l.trim().length > 0),
    labels.join(",")
  );
  check("이름이 서로 다르다", new Set(labels).size === labels.length);
  check(
    "이름표에 «남는» 키가 없다 — 벤더에서 빠진 색이 목록에 남아 있지 않다",
    Object.keys(GANTT_COLOR_LABEL).length === GANTT_COLOR_KEYS.length,
    `이름표 ${Object.keys(GANTT_COLOR_LABEL).length} / 키 ${GANTT_COLOR_KEYS.length}`
  );

  console.log("\n★ 팔레트를 베끼지 않았다");
  /*
   * 베낀 사본은 **첫날에는 벤더와 같아서** 위 단언이 전부 통과합니다. 갈리는
   * 것은 재벤더링하는 날이고 그때는 아무도 안 봅니다. 그래서 «우리 소스에 CSS
   * 값 리터럴이 없다»를 따로 잽니다.
   */
  /*
   * 🔄 **`project-gantt-model.ts` 를 더했습니다** (`DEC-075`). 화면을 오르비
   *    형태로 갈아엎으면서 «키 → CSS» 를 실제로 부르는 자리가 어댑터
   *    (`project-gantt.tsx`)에서 **모델**로 옮겨 갔습니다 — `toGanttEvents` 가
   *    막대를 만들며 그 변환을 합니다. 목록을 안 고쳤으면 이 검사는 **정작
   *    변환하는 파일을 안 보는** 상태가 됐을 것입니다.
   */
  const OURS = [
    "src/features/projects/gantt-color-css.ts",
    "src/features/projects/schema.ts",
    "src/features/projects/components/project-gantt-color-picker.tsx",
    "src/features/projects/components/project-gantt.tsx",
    "src/features/projects/components/project-gantt-model.ts",
  ];
  const cssRaw = readFileSync(join(ROOT, OURS[0]), "utf8");
  const cssSrc = stripComments(cssRaw);
  /*
   * **주석 제거가 실제로 일어나는지 먼저 봅니다.** 원문에는 주석 «안»에
   * `var(--color-blue-500)` 이 실재합니다(그 파일의 머리 설명). 안 벗기면
   * 아래 「없다」가 헛 빨개지고, 벗기는 코드가 죽으면 이 대조가 먼저 웁니다.
   */
  check(
    "대조군 — 원문 주석에는 CSS 값이 실재한다",
    /var\(--color-blue-500\)/.test(cssRaw)
  );
  check(
    "대조군 — 주석을 벗기면 그것이 사라진다",
    !/var\(--color-blue-500\)/.test(cssSrc)
  );

  for (const rel of OURS) {
    const src = stripComments(readFileSync(join(ROOT, rel), "utf8"));
    check(
      `코드에 CSS 값 리터럴이 없다 — ${rel.replace("src/features/projects/", "")}`,
      !/var\(\s*--color-/.test(src)
    );
  }
  check(
    "변환기가 벤더의 팔레트를 import 한다",
    /import\s*\{\s*GANTT_COLORS\s*\}\s*from\s*"@\/components\/reui\/gantt\//.test(
      cssSrc
    )
  );

  console.log("\n★ 팔레트를 쓰는 우리 파일이 하나뿐이다");
  /*
   * 두 번째 소비자가 생기면 «키 → CSS» 변환도 둘이 되고, 그때부터 **한쪽만
   * 고치는 사고**가 가능해집니다. 벤더 디렉터리는 정의가 있는 자리라 뺍니다.
   */
  const NEEDLE = "GANTT" + "_COLORS"; // 이 파일 자신이 세어지지 않도록 쪼개 적는다
  const usersOfPalette = (skipVendor: boolean): string[] => {
    const hits: string[] = [];
    const walk = (dir: string, rel: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const next = `${rel}/${e.name}`;
        if (e.isDirectory()) {
          if (skipVendor && e.name === "reui") continue;
          walk(join(dir, e.name), next);
          continue;
        }
        if (!/\.tsx?$/.test(e.name)) continue;
        if (
          stripComments(readFileSync(join(dir, e.name), "utf8")).includes(
            NEEDLE
          )
        ) {
          hits.push(next);
        }
      }
    };
    walk(join(ROOT, "src"), "src");
    return hits.sort();
  };
  const ours = usersOfPalette(true);
  /*
   * **대조군.** 벤더를 빼지 않고 훑으면 «정의가 있는 자리»가 더 걸려야 합니다.
   * 같아지면 순회가 아예 안 돌고 있다는 뜻이고, 그러면 아래 「하나뿐이다」는
   * 빈 배열을 빈 배열과 비교하는 공짜 통과가 됩니다.
   */
  check(
    "대조군 — 벤더를 포함해 훑으면 더 걸린다(순회가 실제로 돈다)",
    usersOfPalette(false).length > ours.length,
    `포함 ${usersOfPalette(false).length} / 제외 ${ours.length}`
  );
  check(
    "팔레트를 쓰는 우리 파일이 변환기 하나뿐이다",
    JSON.stringify(ours) ===
      JSON.stringify(["src/features/projects/gantt-color-css.ts"]),
    ours.join(", ")
  );
}

try {
  run();
} catch (e) {
  console.error(e);
  fail++;
}
console.log(`\n합계: 통과 ${pass} · 실패 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
