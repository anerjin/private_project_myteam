// ============================================================
// QueenBee 문서 뷰어 콘텐츠 생성기
//   _docs 아래의 하위 폴더(EXCLUDE 제외)를 자동 발견해
//   각 폴더의 .md 파일을 content.js (window.DOCS) 로 임베드한다.
//   file:// 로 열어도 동작하도록 fetch 대신 <script src> 방식 사용.
//
//   사용법:
//     node build.mjs            문서 수정 후 1회 갱신
//     node build.mjs --watch    파일이 바뀔 때마다 자동 갱신 (편집 중 켜두면 됨)
//
//   폴더/파일 자동화:
//     · 새 .md 파일  → 그냥 폴더에 넣으면 자동 포함 (재빌드만)
//     · 새 폴더      → _docs 아래 만들면 자동으로 새 그룹이 됨 (KNOWN 안 고쳐도 됨)
//     · 순서/라벨/ID 접두어를 지정하고 싶은 폴더만 아래 KNOWN 에 등록
//
//   ※ 스캔은 **재귀가 아니다**. `_docs/<폴더>/*.md` 한 겹만 본다.
//     하위 폴더를 만들면 그 안의 문서는 뷰어에 나오지 않는다 — 문서는 폴더 바로 아래 평평하게 둔다.
// ============================================================
import { readdirSync, readFileSync, writeFileSync, watch } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(__dirname, ".."); // _docs
const OUT = join(__dirname, "content.js");

// 그룹에서 제외할 폴더.
//   _viewer   뷰어 자신
const EXCLUDE = new Set(["_viewer"]);

// 알려진 그룹의 순서·라벨·ID 접두어. 여기 없는 폴더도 자동으로 그룹이 되며,
// 라벨은 폴더명에서, 순서는 뒤로, 코드는 G1/G2… 로 자동 부여된다.
//
// 등록하지 않으면 자동 코드(G1/G2…)를 가져가면서 뒤 폴더의 코드가 밀려
// 기존 문서 ID가 조용히 바뀐다. 그래서 전 폴더에 고정 코드를 준다.
const KNOWN = {
  "01.요구사항": { order: 1, label: "요구사항", code: "REQ" },
  "02.개발설계": { order: 2, label: "개발 설계", code: "DEV" },
  // 그룹 코드는 DCS 다. 문서 안의 의사결정 항목 ID 가 DEC-001 이라 DEC 를 쓰면
  // 문서 ID(DEC-01)와 항목 ID(DEC-001)가 눈으로 구분되지 않는다.
  "03.의사결정_및_미해결사항": { order: 3, label: "의사결정 · 미해결", code: "DCS" },
  // 04~06 은 아직 없는 폴더의 **예약**이다. 만들 때 이름만 맞추면 코드가 그대로 붙는다.
  // 미리 잡아두는 이유는 위와 같다 — 나중에 등록하면 그 사이 폴더의 자동 코드가 밀린다.
  "04.기능별_진척도": { order: 4, label: "기능별 진척도", code: "PRG" },
  "05.디자인시스템": { order: 5, label: "디자인 시스템", code: "DSN" },
  "06.부록": { order: 6, label: "부록", code: "APX" },
  // 개발하면서 그때그때 적는 기록. 정리된 01~06 과 성격이 달라 맨 뒤에 둔다.
  "99.memory": { order: 99, label: "memory", code: "MEM" },
};

function discoverGroups() {
  let entries = [];
  try {
    entries = readdirSync(DOCS_DIR, { withFileTypes: true });
  } catch {
    console.warn("⚠ _docs 폴더를 읽지 못했습니다.");
  }
  const dirs = entries.filter((d) => d.isDirectory() && !EXCLUDE.has(d.name)).map((d) => d.name);

  let auto = 0;
  const groups = dirs.map((dir) => {
    const k = KNOWN[dir];
    return {
      dir,
      name: dir,
      label: k?.label ?? dir.replace(/^_/, "").replace(/_/g, " "),
      code: k?.code ?? "G" + ++auto,
      order: k?.order ?? 100 + dirs.indexOf(dir),
    };
  });

  // _docs 바로 아래의 .md 도 그룹으로 잡는다. 진입점인 README.md 가 여기 있는데
  // 폴더가 아니라서 예전에는 뷰어에 아예 안 나왔다.
  // name 은 빈 문자열이다 — 해시가 `#/README.md` 가 되고, fromHash 는 첫 '/' 앞을 그룹명으로
  // 읽으므로 그대로 맞는다. dir 은 "." 이라 join(DOCS_DIR, ".") 로 루트를 읽는다.
  if (entries.some((d) => d.isFile() && d.name.toLowerCase().endsWith(".md"))) {
    groups.push({ dir: ".", name: "", label: "시작", code: "TOP", order: -1 });
  }

  return groups.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "ko"));
}

function idOf(code, file) {
  const base = file.replace(/\.md$/i, "");
  if (base.toLowerCase() === "readme") return code + "-README";
  // 앞 번호가 정본이다(01_프로젝트_개요 → REQ-01).
  const lead = base.match(/^(\d+)/);
  if (lead) return code + "-" + lead[1];
  // 뒤에 번호가 붙는 이름도 받는다(memory_01 → MEM-01).
  // 이 갈래가 없으면 아래 slice(0,6) 로 떨어져 memory_01 과 memory_02 가 **둘 다 MEM-MEMORY** 가 된다
  // — 문서 ID 는 딥링크·복사 버튼이 쓰는 값이라 충돌하면 조용히 엉뚱한 문서를 가리킨다.
  const tail = base.match(/(\d+)$/);
  if (tail) return code + "-" + tail[1];
  return code + "-" + base.slice(0, 6).toUpperCase();
}

function sortFiles(a, b) {
  const ar = a.toLowerCase() === "readme.md";
  const br = b.toLowerCase() === "readme.md";
  if (ar && !br) return -1;
  if (!ar && br) return 1;
  return a.localeCompare(b, "ko", { numeric: true });
}

function titleOf(file) {
  const base = file.replace(/\.md$/i, "");
  if (base.toLowerCase() === "readme") return "README";
  return base.replace(/_/g, " ");
}

function build() {
  const groups = discoverGroups().map((g) => {
    let files = [];
    try {
      files = readdirSync(join(DOCS_DIR, g.dir)).filter((f) => f.toLowerCase().endsWith(".md"));
    } catch {
      console.warn(`⚠ 폴더 없음: ${g.dir}`);
    }
    files.sort(sortFiles);
    return {
      name: g.name,
      label: g.label,
      files: files.map((file) => ({
        file,
        title: titleOf(file),
        id: idOf(g.code, file),
        md: readFileSync(join(DOCS_DIR, g.dir, file), "utf8"),
      })),
    };
  });

  const out = `// 자동 생성 파일 — build.mjs 로 생성됨. 직접 수정하지 마세요.\nwindow.DOCS = ${JSON.stringify(
    { groups }
  )};\n`;
  writeFileSync(OUT, out, "utf8");

  const total = groups.reduce((n, g) => n + g.files.length, 0);
  const stamp = new Date().toLocaleTimeString("ko-KR");
  console.log(`✓ [${stamp}] content.js 생성 — ${groups.length}개 그룹 / ${total}개 문서`);
  groups.forEach((g) => console.log(`  · ${g.label}: ${g.files.length}개`));
}

build();

// --- watch 모드 --------------------------------------------------
if (process.argv.includes("--watch")) {
  console.log("\n👀 watch 모드: _docs 아래 .md 변경을 감시합니다. (Ctrl+C 종료)");
  let timer = null;
  watch(DOCS_DIR, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    const f = String(filename).replace(/\\/g, "/");
    // 뷰어 자신(content.js 재작성)·비-md 변경은 무시 → 무한 루프 방지
    if (f.startsWith("_viewer/") || !f.toLowerCase().endsWith(".md")) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        build();
      } catch (e) {
        console.error("빌드 실패:", e.message);
      }
    }, 150);
  });
}
