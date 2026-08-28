/**
 * **페이즈 작업표의 요구사항 번호가 코드에 있는가.**
 *
 *   node scripts/check-fr-coverage.mjs          # 끝난 마일스톤만
 *   node scripts/check-fr-coverage.mjs M2 M4    # 지정
 *   node scripts/check-fr-coverage.mjs --all
 *
 * ## 왜 필요한가 — 「DoD 통과 ≠ 규격 충족」
 *
 * `P4` 를 DoD 5항목 전부 달성으로 닫으려던 참에 **`P0` 규격 둘이 빠져 있는 것**이
 * 리뷰에서 드러났습니다.
 *
 * | 빠진 것 | 어디 있었나 | DoD 는 |
 * | --- | --- | --- |
 * | `FR-SRCH-004` 북마크순 정렬 | `M2` 작업표 「필터, 정렬」 | 「필터·정렬·페이징이 모두 동작한다」로 통과 |
 * | `FR-SRCH-003` 기간 필터 | 같은 줄 | 위와 같음 |
 * | `FR-RES-014` 조회수 중복 제외 | `M2` 작업표 「조회수」 | 묻지 않음 |
 *
 * DoD 5항목은 **성능과 기전**을 쟀습니다 — P95 500ms, `src/mocks/` 삭제,
 * `DEC-032` 병합. 그 어느 것도 **「이 페이즈 작업표의 요구사항을 하나씩 짚었는가」**
 * 를 묻지 않았고, 그래서 셋 다 통과했습니다.
 *
 * > 「확인하는 법」이 **결정** 단위의 장치라면, 이건 **페이즈** 단위의 같은 장치입니다.
 *
 * ## 이 검사가 증명하는 것과 못 하는 것
 *
 * | 본다 | 못 본다 |
 * | --- | --- |
 * | 요구사항 번호가 코드 어디에도 **없다** | 번호는 적혔는데 **구현이 틀렸다** |
 * | 작업표에 있는데 아무도 손대지 않았다 | 주석만 달고 실제로는 안 만들었다 |
 *
 * **없음을 찾는 도구입니다.** 「있음」은 사람이 리뷰합니다 —
 * 위 셋은 전부 「없음」이었고, 이 검사면 셋 다 페이즈 안에서 잡혔습니다.
 */
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const ROADMAP = path.resolve(
  ROOT,
  "../_docs/02.개발설계/07_개발_로드맵.md"
);

/**
 * **인정한 부채.** 작업표에 있지만 아직 안 만든 것 — 다만 «아는 채로» 안 만든 것.
 *
 * `MOCK_DEBT` 와 같은 규칙입니다: **여기 있는 번호가 코드에 나타나면 그것도
 * 위반입니다.** 만들고 나서 목록을 안 지우면 「목록이 곧 남은 일」이 거짓이 되고,
 * 그 순간 이 파일은 아무것도 말하지 않는 목록이 됩니다.
 *
 * **`P0` 요구사항은 여기 못 들어옵니다.** `P0` 가 빠진 채로 페이즈를 닫는 것이
 * 바로 `P4` 리뷰가 잡아낸 문제입니다.
 */
const DEBT = [
  {
    id: "FR-SRCH-007",
    priority: "P1",
    why: "태그 자동완성. 태그 칸이 쉼표로 구분된 한 줄이라 `<datalist>` 로는 안 되고 콤보박스가 필요하다 — `P5` 가 타입 폼 5종을 다시 만들므로 그때 함께 만든다",
    until: "P5",
  },
  {
    id: "FR-RES-008",
    priority: "P1",
    why: "자료 복구(휴지통에서 되살리기). 읽는 쪽(`scope: \"trash\"`)과 감사 액션(`RESOURCE_RESTORE`)은 있지만 되살리는 service·action 이 없다 — 휴지통 화면 자체가 `P8`(관리자 전체) 몫이라 함께 만든다",
    until: "P8",
  },
];

/**
 * ## 안 만든 것의 번호를 **주석에 적지 마십시오**
 *
 * 이 검사는 번호가 코드에 있으면 「만들었다」로 셉니다. 그래서
 * *"복구(`FR-RES-008`)는 `P8` 몫입니다"* 처럼 **「아직 없다」고 설명하는 주석이
 * 그 번호를 달면 게이트가 그 말을 못 알아듣고 통과시킵니다.**
 *
 * 실제로 그렇게 될 뻔했습니다 — `FR-RES-008`(복구)은 `RESOURCE_RESTORE` 감사
 * 액션과 휴지통 조회만 있고 되살리는 코드가 없는데, 삭제 다이얼로그 주석이
 * 「복구는 `P8` 몫」이라고 적으면서 번호를 달아 **`M2` 에서 「인용됨」으로
 * 세어지고 있었습니다.**
 *
 * 안 만든 것의 번호는 **여기 `DEBT` 에만** 적습니다. 주석에는 기능 이름과
 * 페이즈만 씁니다(「되살리기는 아직 없다 — `P8`」).
 */

/**
 * **닫힌 작업표의 요구사항 «집합»을 박아 둡니다.**
 *
 * 이 검사는 문서를 파싱합니다 — `check-deps` 와 달리 **서식이 조금만 바뀌어도
 * 파서가 조용히 아무것도 못 읽습니다.** 실제로 두 자리가 그랬습니다:
 *
 * | 던진 것 | 그때 결과 |
 * | --- | --- |
 * | `## 7.4 M2 — 자료 코어` → `M2 · 자료 코어` | 「작업표를 찾지 못했습니다」 한 줄 찍고 **exit 0** |
 * | 표의 한 행을 평문으로 | 요구사항이 **20건 → 16건으로 조용히 줄어듦** |
 *
 * 「0건은 증거가 아니다」를 이 저장소가 `DEC-044` 에서 배웠는데, 그걸 배워서
 * 만든 도구가 같은 구멍을 갖고 있었습니다.
 *
 * 끝난 마일스톤의 작업표는 **닫혀서 안 바뀌므로** 고정본을 둘 수 있습니다.
 * 개수가 아니라 **번호 집합**을 박습니다 — 개수가 같은 채 내용이 바뀌는
 * 경우까지 잡힙니다. `MOCK_DEBT` 와 같은 철학입니다: 목록이 곧 사실이고,
 * 사실이 바뀌면 **사람이 목록을 고치는 행위**가 강제됩니다.
 *
 * 진행 중인 마일스톤(`M3` 이후)은 여기 없으므로 매일 고쳐도 안 걸립니다.
 *
 * 갱신은 `node scripts/check-fr-coverage.mjs --fixture` 가 찍어 줍니다 —
 * **손으로 세지 마십시오.**
 */
const FIXTURE = {
  M0: ["NFR-BACKUP-007"],
  "M0.5": ["NFR-SEC-007"],
  M1: [
    "FR-ADM-002",
    "FR-ADM-004",
    "FR-AUDIT-001",
    "FR-AUTH-001",
    "FR-AUTH-002",
    "FR-AUTH-006",
    "FR-AUTH-007",
    "FR-AUTH-011",
    "FR-AUTH-012",
    "FR-NOTI-001",
    "FR-NOTI-002",
    "FR-USER-006",
    "FR-USER-008",
    "NFR-SEC-001",
    "NFR-SEC-006",
    "NFR-SEC-017",
  ],
  M2: [
    "FR-ADM-014",
    "FR-RES-001",
    "FR-RES-003",
    "FR-RES-004",
    "FR-RES-005",
    "FR-RES-006",
    "FR-RES-007",
    "FR-RES-008",
    "FR-RES-011",
    "FR-RES-014",
    "FR-RES-015",
    "FR-SRCH-001",
    "FR-SRCH-003",
    "FR-SRCH-004",
    "FR-SRCH-005",
    "FR-SRCH-006",
    "FR-SRCH-007",
    "FR-COLL-001",
    "FR-COLL-002",
    "NFR-A11Y-006",
  ],
};

/** 페이즈 목록 표(7.11)와 같은 사실이므로 여기 적지 않고 문서에서 읽는다 */
function phasesByMilestone(doc) {
  const map = new Map();
  const re = /^\|\s*\*\*(P\d)\*\*\s*\|([^|]*)\|\s*`(M[\d.]+)`\s*\|/gm;
  for (const m of doc.matchAll(re)) {
    const [, phase, name, milestone] = m;
    if (!map.has(milestone)) map.set(milestone, []);
    map.get(milestone).push({ phase, name: name.trim() });
  }
  return map;
}

/**
 * 마일스톤 절의 작업표를 읽어 요구사항 번호를 편다.
 *
 * `FR-RES-004~008` 같은 범위와 `FR-RES-003`, `015` 처럼 **접두어를 생략한
 * 이어쓰기**를 둘 다 풉니다 — 문서가 실제로 그렇게 적혀 있고, 안 풀면
 * 「015 는 코드에 없다」 같은 헛된 지적이 납니다.
 */
function parseWorkTable(doc, milestone) {
  const start = doc.search(
    new RegExp(`^## [\\d.]+ ${milestone.replace(".", "\\.")} — `, "m")
  );
  if (start < 0) return null;
  const rest = doc.slice(start + 1);
  /*
   * **끝은 「다음 `##`」이지 「다음 마일스톤 절」이 아닙니다.**
   * 마지막 마일스톤(`M6`)은 뒤에 마일스톤 절이 없어 7.9~7.13 (페이즈 목록표 ·
   * 리스크 · 변경 이력)까지 통째로 구간에 들어옵니다. 지금은 우연히 그 표들이
   * 3자리 숫자를 안 물어 조용하지만, `P9` 를 닫을 때 터집니다.
   */
  const end = rest.search(/^## /m);
  const section = end < 0 ? rest : rest.slice(0, end);

  const items = [];
  for (const line of section.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 4) continue;
    const [, task, req] = cells;
    if (!task || task === "작업" || /^-+$/.test(task)) continue;

    const ids = [];
    let lastPrefix = null;
    /*
     * `FR-RES-004~008` 범위 · `FR-SRCH-006` · `, 007` 이어쓰기 · `NFR-A11Y-006`.
     *
     * **`lastPrefix` 는 «다른» 접두어를 만나면 끊습니다.** 안 끊으면
     * 「`DEC-032`, `FR-ADM-014`」 같은 칸에서 순서가 뒤집혔을 때 `DEC-032` 의
     * `032` 가 `FR-ADM-032` 라는 **유령 번호**가 됩니다.
     */
    const tokenRe =
      /(?:([A-Z]{2,}(?:-[A-Z0-9]+)*)-)?(\d{3})(?:\s*~\s*(\d{3}))?/g;
    for (const t of req.matchAll(tokenRe)) {
      if (t[1] && !/^N?FR-/.test(t[1])) {
        lastPrefix = null; // `DEC`·`API`·`SCR` 등 — 이어쓰기를 끊는다
        continue;
      }
      const prefix = t[1] ?? lastPrefix;
      if (!prefix) continue;
      lastPrefix = prefix;
      const from = Number(t[2]);
      const to = t[3] ? Number(t[3]) : from;
      for (let n = from; n <= to; n++) {
        ids.push(`${prefix}-${String(n).padStart(3, "0")}`);
      }
    }
    if (ids.length) items.push({ task: task.replaceAll("**", ""), ids });
  }
  return items;
}

/** 코드·마이그레이션·검증 스크립트 전부를 본다 — 요구사항을 «어디서» 인용하든 인정한다 */
function loadCorpus() {
  const files = [
    ...globSync("src/**/*.{ts,tsx}", { cwd: ROOT }),
    ...globSync("scripts/**/*.{ts,mjs}", { cwd: ROOT }),
    ...globSync("prisma/**/*.{ts,sql}", { cwd: ROOT }),
  ];
  return (
    files
      /*
       * **자기 자신은 빼야 합니다.** `DEBT` 에 적은 번호가 코퍼스에 잡혀
       * 「부채라면서 코드에 있다」고 스스로를 고발했습니다 — `check-deps` 의
       * 목 예외 목록이 같은 이유로 자기 파일을 제외하는 것과 같습니다.
       */
      .filter((f) => path.basename(f) !== path.basename(fileURLToPath(import.meta.url)))
      .map((f) => ({
        file: f,
        code: readFileSync(path.resolve(ROOT, f), "utf8"),
      }))
  );
}

const doc = readFileSync(ROADMAP, "utf8");
const phaseMap = phasesByMilestone(doc);
const corpus = loadCorpus();

const args = process.argv.slice(2);
/** 끝난 페이즈의 마일스톤 — 새 페이즈를 닫을 때 여기에 더한다 */
const DONE = ["M0", "M0.5", "M1", "M2"];

/**
 * `--all` 은 문서의 마일스톤 «절»에서 뽑습니다. 페이즈 목록표(7.11)에서 뽑으면
 * **`M0.5` 가 빠집니다** — 그 표에 `M0.5` 행이 없어서입니다.
 * 「전부」라는 이름이 전부가 아닌 채로 두면 안 됩니다.
 */
const allMilestones = [...doc.matchAll(/^## [\d.]+ (M[\d.]+) — /gm)].map(
  (m) => m[1]
);

const targets = args.includes("--all")
  ? allMilestones
  : args.filter((a) => /^M/.test(a)).length
    ? args.filter((a) => /^M/.test(a))
    : DONE;

let broken = 0;

/*
 * **7.11 표를 못 읽으면 실패입니다.** 지금까지는 라벨에서 `(P4)` 가 조용히
 * 사라질 뿐이었는데, 그건 그 표의 서식이 바뀌었다는 신호입니다.
 */
if (phaseMap.size === 0) {
  console.log(
    "✗ 페이즈 목록표(7.11)를 한 행도 읽지 못했습니다 — 표 서식이 바뀌었습니다"
  );
  broken++;
}

// `--fixture` — 고정본을 손으로 세지 않게 스스로 찍는다
if (args.includes("--fixture")) {
  const out = {};
  for (const m of allMilestones) {
    const items = parseWorkTable(doc, m) ?? [];
    out[m] = [...new Set(items.flatMap((i) => i.ids))].sort();
  }
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

let missingTotal = 0;
for (const milestone of targets) {
  const items = parseWorkTable(doc, milestone);
  if (!items) {
    /*
     * **전에는 여기서 한 줄 찍고 `continue` 했습니다 — exit 0 이었습니다.**
     * 절 제목 서식이 바뀌면 검사가 「아무 문제 없음」이라고 말했습니다.
     */
    console.log(
      `✗ ${milestone} — 작업표 절을 찾지 못했습니다. 제목 서식(\`## 7.x ${milestone} — 이름\`)이 바뀌었습니까?`
    );
    broken++;
    continue;
  }

  /*
   * **닫힌 마일스톤은 번호 집합이 고정본과 같아야 합니다.**
   * 파서가 반쯤 읽으면 요구사항이 조용히 줄어드는데(실측: 20 → 16),
   * 그때 「16건 전부 인용됨」이 초록으로 찍힙니다.
   */
  const fixture = FIXTURE[milestone];
  if (fixture) {
    const got = [...new Set(items.flatMap((i) => i.ids))].sort();
    const want = [...fixture].sort();
    const gone = want.filter((id) => !got.includes(id));
    const added = got.filter((id) => !want.includes(id));
    if (gone.length || added.length) {
      console.log(
        `✗ ${milestone} — 닫힌 작업표가 고정본과 다릅니다 (파서가 깨졌거나 표가 바뀌었습니다)`
      );
      if (gone.length) console.log(`    사라짐: ${gone.join(", ")}`);
      if (added.length) console.log(`    새로 생김: ${added.join(", ")}`);
      console.log(
        `    표를 «의도적으로» 고쳤다면 \`--fixture\` 로 다시 찍어 FIXTURE 를 갱신하십시오`
      );
      broken++;
      continue;
    }
  }
  const phases = (phaseMap.get(milestone) ?? [])
    .map((p) => p.phase)
    .join("·");
  const missing = [];
  const debts = [];
  const seen = new Set();

  for (const item of items) {
    for (const id of item.ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const hit = corpus.find((f) => f.code.includes(id));
      const debt = DEBT.find((d) => d.id === id);
      if (hit) {
        // **부채라고 적어 놓고 만들어 놨다면 목록을 지워야 한다**
        if (debt) {
          missing.push({
            id,
            task: `부채 목록에 남아 있는데 코드에 있습니다 (${hit.file}) — DEBT 에서 지우십시오`,
          });
        }
        continue;
      }
      if (debt) debts.push(debt);
      else missing.push({ id, task: item.task });
    }
  }

  const label = `${milestone}${phases ? ` (${phases})` : ""}`;
  const cited = seen.size - debts.length - missing.length;
  if (missing.length === 0) {
    const tail = debts.length ? ` · 인정한 부채 ${debts.length}건` : "";
    console.log(`✓ ${label} — 요구사항 ${seen.size}건 중 ${cited}건 인용됨${tail}`);
  } else {
    console.log(
      `✗ ${label} — 요구사항 ${seen.size}건 중 ${missing.length}건이 코드에 없음 (인용 ${cited} · 부채 ${debts.length})`
    );
    for (const m of missing) console.log(`    ✗ ${m.id}  ← 「${m.task}」`);
    missingTotal += missing.length;
  }
  // 부채는 통과 여부와 상관없이 «항상» 보여준다 — 안 보이면 잊힌다
  for (const d of debts) {
    console.log(`    · ${d.id} (${d.priority}, ${d.until} 까지) — ${d.why}`);
  }
}

if (missingTotal > 0) {
  console.log(
    `\n작업표에 있는데 코드에 흔적이 없는 요구사항 ${missingTotal}건.\n` +
      `구현했는데 번호를 안 적었다면 «주석에 번호를 적으십시오» — ` +
      `그래야 다음 사람이 이 검사를 믿을 수 있습니다.\n` +
      `아직 안 만든 것이라면 «주석이 아니라 DEBT 에» 적으십시오 — ` +
      `번호가 코드에 있으면 이 검사는 「만들었다」로 셉니다.`
  );
}

/**
 * **파서가 깨진 것과 요구사항이 빠진 것을 나눠 셉니다.**
 * 둘 다 실패지만 고치는 사람이 다릅니다 — 앞은 문서/검사기, 뒤는 코드입니다.
 */
if (broken > 0) {
  console.log(
    `\n검사기가 문서를 제대로 읽지 못한 자리 ${broken}건. ` +
      `**이건 「위반 0건」이 아니라 「모른다」입니다** — 고치기 전에는 이 검사의 초록을 믿지 마십시오.`
  );
}

if (missingTotal > 0 || broken > 0) process.exit(1);
