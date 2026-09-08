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
const REQ = path.resolve(ROOT, "../_docs/01.요구사항/03_기능_요구사항.md");

/**
 * 요구사항 대장 — **번호와 우선순위를 문서에서 읽습니다** (`OPEN-017` 해소).
 *
 * ## 왜 필요했나
 *
 * 이 검사는 «작업표에 있는 번호»만 봤습니다. 그래서 **번호를 한 행에서 빼고
 * 아무 데도 안 넣으면 조용히 사라졌습니다** — 여덟 페이즈 내내 「없다」는
 * 사실조차 보고되지 않았고, 실측해 보니 **15건**이 그 상태였습니다.
 * 그중 `P0` 가 넷이었습니다.
 *
 * 그리고 `DEBT[].priority` 를 손으로 적고 있었습니다. 「`P0` 는 부채가 될 수
 * 없다」는 규칙이 그 손글씨에 기대고 있었으니, **틀리게 적으면 규칙이
 * 통과합니다.** 이제 문서가 정본입니다.
 */
/**
 * **대장이 몇 건인지 박아 둡니다.** `FIXTURE` 와 같은 이유입니다.
 *
 * 던져 봤습니다: `REQ-03` 의 한 행에서 `| FR-AUTH-001 |` 을 깨뜨렸더니
 * **대장이 104건으로 줄었는데 검사는 조용히 통과**했습니다. 「한 행도 못 읽음」
 * 만 막고 **일부만 못 읽는 것**은 안 막고 있었던 것입니다 — 이 저장소가
 * 이미 두 번 겪은 모양입니다(`M2` 표의 한 행, `###` 하위 절).
 *
 * 요구사항을 더하거나 폐기하면 이 숫자를 **손으로** 고칩니다. 그 한 줄이
 * 「대장이 바뀌었다」를 사람이 알아차리는 자리입니다.
 */
/*
 * `105 → 110`. **`FR-NOTE-001`~`005` 를 더했습니다** — 나의 노트(개인 메모).
 * 운영자가 새로 요청한 기능이고, 요구사항 대장에 없던 항목입니다.
 *
 * `005`(휴지통)는 **뒤늦게 붙었습니다.** 처음에는 「지우면 끝」이었는데,
 * 실수로 지운 메모를 되돌릴 길이 없는 것을 겪고 넣었습니다.
 */
/*
 * `110 → 130`. **`FR-PROJ-001`~`020` 을 더했습니다** — 프로젝트(문서 + 일정).
 *
 * `130 → 122`. **`FR-PROJ-005`~`009`·`012`·`016`·`017` 을 폐기했습니다**(`DEC-075`) —
 * 프로젝트를 gboard(Orbee) 형태로 바꾸며 문서·하위 할 일·선후행·마일스톤을 뗐습니다.
 * 운영자 요청이고 대장에 없던 도메인입니다 (`DEC-069` · 로드맵 `M7`).
 *
 * 이때 `REQ-03` 3.1 요약표가 **105 에서 멈춰 있던 것**도 함께 드러났습니다 —
 * `NOTE` 다섯이 대장에는 있는데 요약에서 빠져 있었고, 이 검사는 대장 행을
 * 세므로 110 을 보고 있었습니다. **사람이 보는 표만 거짓이었습니다.**
 */
const EXPECTED_REQUIREMENTS = 122;

function loadRequirements() {
  const src = readFileSync(REQ, "utf8");
  const rows = [
    ...src.matchAll(/^\| (FR-[A-Z]+-\d{3}) \| ([^|]+) \|[^|]*\| (P\d) \|/gm),
  ];
  return new Map(
    rows.map((m) => [m[1], { id: m[1], name: m[2].trim(), priority: m[3] }])
  );
}

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
    id: "FR-FILE-005",
    priority: "P1",
    why: "첨부 이미지 썸네일. `GENERATE_THUMBNAIL` 작업 타입과 `files.role=THUMBNAIL` 자리는 있지만 만드는 코드가 없다. `P8` 에서 다시 봤고 **또 미룹니다** — 첨부 목록이 지금 이미지를 «전혀 그리지 않기» 때문입니다(이름 + 내려받기 링크뿐). 즉 썸네일이 없어서 느린 화면이 하나도 없고, 순수하게 장식입니다. 반대로 비용은 실합니다: 리사이저는 네이티브 바이너리(`sharp`)라 2단계 Docker 이관에 붙습니다 (`REQ-01 · 1.7` 「유지보수 난이도가 낮은 구조를 우선한다」)",
    until: "P9",
    /** 다시 볼 시점 — 이 조건이 오면 «장식»이 아니게 됩니다 */
    trigger: "첨부 목록이 이미지를 인라인으로 그리기 시작할 때. 그 화면을 만드는 순간 원본(최대 50MB)을 그대로 받게 되므로 그때는 썸네일이 필수가 된다",
  },



  {
    id: "FR-PROJ-019",
    priority: "P1",
    why: "프로젝트 안 검색. **처음부터 만든 적이 없습니다** — `git grep FR-PROJ-019 HEAD` 가 0건이고, `DEC-075`(gboard 형태로 교체) 이전에도 인용이 없었습니다. 교체가 없앤 것이 아니라 원래 비어 있던 자리라, 이제야 이름이 붙었습니다. 지금 미루는 이유: 한 프로젝트의 항목은 간트 한 화면에 다 들어가고(항목이 수십 개를 넘지 않습니다) 제목이 전부 보입니다 — 찾을 것이 화면에 이미 있는데 검색칸을 두면 «있으니까 쓰는» 기능이 됩니다",
    until: "P10",
    /** 다시 볼 시점 — 이 조건이 오면 «화면에 다 보인다» 가 거짓이 됩니다 */
    trigger: "한 프로젝트의 항목이 한 화면을 넘기 시작할 때. 실제 운영에서 그 수를 보고 정합니다 — 지금 정하면 쓰지도 않을 화면을 먼저 만듭니다",
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
  M0: [
    "NFR-BACKUP-007",
  ],
  "M0.5": [
    "NFR-SEC-007",
  ],
  M1: [
    "FR-ADM-002",
    "FR-ADM-004",
    "FR-AUDIT-001",
    "FR-AUTH-001",
    "FR-AUTH-002",
    "FR-AUTH-004",
    "FR-AUTH-006",
    "FR-AUTH-007",
    "FR-AUTH-008",
    "FR-AUTH-009",
    "FR-AUTH-011",
    "FR-AUTH-012",
    "FR-NOTI-001",
    "FR-NOTI-002",
    "FR-NOTI-003",
    "FR-USER-001",
    "FR-USER-003",
    "FR-USER-004",
    "FR-USER-006",
    "FR-USER-008",
    "NFR-SEC-001",
    "NFR-SEC-006",
    "NFR-SEC-017",
  ],
  M2: [
    "FR-ADM-014",
    "FR-COLL-001",
    "FR-COLL-002",
    "FR-RES-001",
    "FR-RES-002",
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
    "FR-SRCH-002",
    "FR-SRCH-003",
    "FR-SRCH-004",
    "FR-SRCH-005",
    "FR-SRCH-006",
    "FR-SRCH-007",
    "NFR-A11Y-006",
  ],
  M3: [
    "FR-CLI-001",
    "FR-CLI-002",
    "FR-CLI-003",
    "FR-CLI-004",
    "FR-CLI-005",
    "FR-CLI-006",
    "FR-CLI-007",
    "FR-CLI-008",
    "FR-CLI-009",
    "FR-CLI-010",
    "NFR-SEC-018",
  ],
  "M4.1": [
    "FR-RES-005",
    "FR-TYPE-001",
    "FR-TYPE-002",
    "FR-TYPE-003",
    "FR-TYPE-004",
    "FR-TYPE-005",
    "FR-TYPE-006",
    "FR-TYPE-007",
    "FR-TYPE-008",
  ],
  M5: [
    "FR-ADM-001",
    "FR-ADM-002",
    "FR-ADM-003",
    "FR-ADM-004",
    "FR-ADM-005",
    "FR-ADM-006",
    "FR-ADM-007",
    "FR-ADM-008",
    "FR-ADM-009",
    "FR-ADM-010",
    "FR-ADM-011",
    "FR-ADM-012",
    "FR-ADM-013",
    "FR-ADM-014",
    "FR-ADM-015",
    "FR-ADM-016",
    "FR-AUDIT-002",
    "FR-COLL-003",
    "FR-COLL-004",
    "FR-COLL-005",
    "FR-COLL-006",
    "FR-RES-009",
    "FR-USER-002",
    "FR-USER-007",
  ],
  "M4.2": [
    "FR-FILE-001",
    "FR-FILE-002",
    "FR-FILE-003",
    "FR-FILE-004",
    "FR-FILE-005",
    "FR-FILE-006",
    "FR-GH-001",
    "FR-GH-002",
    "FR-GH-003",
    "FR-GH-004",
    "FR-GH-005",
    "FR-GH-006",
    "FR-GH-007",
    "FR-GH-008",
    "FR-RES-008",
    "FR-RES-012",
    "NFR-BACKUP-007",
    "NFR-SEC-009",
  ],
};

/** 페이즈 목록 표(7.11)와 같은 사실이므로 여기 적지 않고 문서에서 읽는다 */
function phasesByMilestone(doc) {
  const map = new Map();
  /*
   * `**P5** ✅` 처럼 뒤에 표시가 붙을 수 있다 — 칸 끝까지 허용한다.
   *
   * **`P\d` 가 아니라 `P\d+` 입니다.** 한 자리로 두면 `P10` 행이 통째로
   * 안 읽히고, 그 마일스톤은 **페이즈 이름 없이** 보고됩니다 — 아무도
   * 틀렸다고 말해 주지 않는 조용한 실패입니다. `P10`(프로젝트)을 더하면서
   * 실제로 걸린 자리입니다.
   */
  const re = /^\|\s*\*\*(P\d+)\*\*[^|]*\|([^|]*)\|\s*`(M[\d.]+)`\s*\|/gm;
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
  /*
   * `##` 과 `###` 을 둘 다 받습니다.
   *
   * **`M4` 는 두 페이즈가 나눠 닫습니다** — 타입 5종은 `P5`, GitHub·파일은 `P6`.
   * 그래서 작업표가 `M4.1`·`M4.2` 두 하위 절로 갈렸습니다. 안 그러면 `P5` 를
   * 닫을 때 아직 만들 차례가 아닌 `FR-GH-*`·`FR-FILE-*`(전부 `P0`)를 「빠졌다」고
   * 잡습니다. `M2` 의 행 쪼개기와 같은 처리입니다 (`DEC-049`).
   */
  const esc = milestone.replace(".", "\\.");
  const m = new RegExp(`^(#{2,3}) [\\d.]+ ${esc} — `, "m").exec(doc);
  if (!m) return null;
  const level = m[1].length;
  /*
   * **제목 줄 «뒤»부터 자릅니다.** 전에는 `start + 1`(첫 `#` 하나만) 이었는데,
   * `###` 제목에서는 남은 `## …` 이 곧바로 「다음 제목」에 걸려 **구간이 비었고
   * 「요구사항 0건」이 초록으로** 찍혔습니다. `##` 에서는 우연히 안 걸렸을 뿐입니다.
   */
  const rest = doc.slice(m.index + m[0].length);
  /*
   * **끝은 「같은 깊이 이상의 다음 제목」입니다.**
   * 「다음 마일스톤 절」로 두면 마지막 마일스톤(`M6`)이 7.9~7.13(페이즈 목록표·
   * 리스크·변경 이력)까지 통째로 삼킵니다. 그리고 `##` 만 보면 `M4` 가 자기
   * 하위 절 둘을 다 먹어 «반으로 나눈 의미»가 사라집니다.
   */
  const end = rest.search(new RegExp(`^#{2,${level}} `, "m"));
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
const requirements = loadRequirements();

const args = process.argv.slice(2);
/** 끝난 페이즈의 마일스톤 — 새 페이즈를 닫을 때 여기에 더한다 */
const DONE = ["M0", "M0.5", "M1", "M2", "M3", "M4.1", "M4.2", "M5"];

/**
 * `--all` 은 문서의 마일스톤 «절»에서 뽑습니다. 페이즈 목록표(7.11)에서 뽑으면
 * **`M0.5` 가 빠집니다** — 그 표에 `M0.5` 행이 없어서입니다.
 * 「전부」라는 이름이 전부가 아닌 채로 두면 안 됩니다.
 */
const allMilestones = [...doc.matchAll(/^#{2,3} [\d.]+ (M[\d.]+) — /gm)]
  .map((m) => m[1])
  // `M4` 는 하위 절 `M4.1`·`M4.2` 가 정본이다 — 자기 절에는 표가 없다
  .filter((id) => id !== "M4");

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

/* ────────────────────────────────────────────────────────────────────────
 * 차집합 — **어느 작업표에도 없는 요구사항** (`OPEN-017` 해소)
 *
 * 위의 검사는 「작업표에 있는데 코드에 없는 것」을 봅니다. 그 반대 방향,
 * 「대장에 있는데 **어느 작업표에도 없는 것**」은 아무도 안 봤습니다 —
 * 번호를 한 행에서 빼고 아무 데도 안 넣으면 조용히 사라졌습니다.
 *
 * 실측: 그 상태가 **15건**이었고 그중 `P0` 가 **넷**이었습니다. 여덟 페이즈
 * 동안 「없다」는 사실조차 보고되지 않았습니다.
 *
 * `--all` 이나 인자 없이(=`DONE` 전체) 돌 때만 봅니다. 마일스톤 하나만
 * 지정한 실행에서 「나머지가 다 빠졌다」고 말하면 소음입니다.
 * ──────────────────────────────────────────────────────────────────────── */
let orphanFail = 0;
if (!args.some((a) => /^M/.test(a))) {
  const owned = new Set();
  for (const m of allMilestones) {
    for (const item of parseWorkTable(doc, m) ?? []) {
      for (const id of item.ids) owned.add(id);
    }
  }

  const orphans = [...requirements.values()].filter((r) => !owned.has(r.id));
  if (requirements.size !== EXPECTED_REQUIREMENTS) {
    console.log(
      `\n✗ 요구사항 대장(REQ-03)을 ${requirements.size}건 읽었습니다 — 기대는 ${EXPECTED_REQUIREMENTS}건입니다.\n` +
        `  요구사항을 더하거나 폐기했다면 \`EXPECTED_REQUIREMENTS\` 를 고치십시오.\n` +
        `  아니라면 표 서식이 바뀌어 **일부만 읽히고 있는** 것입니다 — 그 상태의 초록은 거짓입니다.`
    );
    broken++;
  } else if (orphans.length > 0) {
    const byP = { P0: [], P1: [], P2: [] };
    for (const o of orphans) (byP[o.priority] ??= []).push(o);

    console.log(
      `\n어느 작업표에도 없는 요구사항 ${orphans.length}건 (대장 ${requirements.size}건 기준)`
    );
    for (const p of Object.keys(byP).sort()) {
      if (byP[p].length === 0) continue;
      console.log(`  ${p} — ${byP[p].length}건`);
      for (const o of byP[p]) {
        const cited = corpus.some((f) => f.code.includes(o.id));
        console.log(`    · ${o.id} ${o.name}${cited ? " (코드에는 있음 — 번호만 작업표에서 빠졌다)" : ""}`);
      }
    }
    /*
     * **`P0` 가 하나라도 있으면 실패입니다.** `P1`·`P2` 는 「나중에」가 정당한
     * 답일 수 있으므로 보고만 합니다 — 다만 **보이게** 합니다.
     */
    if (byP.P0.length > 0) {
      console.log(
        `\n✗ 그중 «필수»(P0)가 ${byP.P0.length}건입니다. ` +
          `로드맵의 어느 작업표에든 넣으십시오 — 안 넣으면 이 검사가 영원히 못 봅니다.`
      );
      orphanFail = byP.P0.length;
    }
  }
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

if (missingTotal > 0 || broken > 0 || orphanFail > 0) process.exit(1);
