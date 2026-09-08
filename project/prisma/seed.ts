/**
 * 시드 (DEV-02 · 2.6절).
 *
 *   npx prisma db seed
 *
 * **여러 번 돌려도 결과가 같아야 합니다.** 개발 중 스키마를 고치고 다시 돌리는 일이
 * 잦은데, 그때마다 중복 행이 쌓이면 시드를 못 믿게 됩니다. 전부 upsert 로 씁니다.
 *
 * 관리자 계정도 여기서 만듭니다. 별도 스크립트로 빼지 않는 이유:
 * **«돌려야 하는 것»이 두 개가 되면 온보딩에서 하나를 빠뜨립니다.**
 */

import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type ResourceType } from "@prisma/client";

try {
  process.loadEnvFile(".env");
} catch {
  // CI 처럼 환경 변수가 이미 주입된 경우
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL 이 없습니다. project/.env 를 확인하세요.");
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/**
 * 콘텐츠 타입 **운영 설정**만 넣습니다 (`DEC-032`).
 * 라벨·설명·아이콘은 코드 레지스트리가 단일 출처이므로 DB에 두지 않습니다.
 * 순서는 각 타입 폴더의 `meta.ts` 에 있는 sortOrder 와 맞춥니다.
 * (경로에 글로브 `*`를 쓰면 `*` 와 `/` 가 붙어 블록 주석이 조기 종료됩니다)
 */
const CONTENT_TYPES: { type: ResourceType; sortOrder: number }[] = [
  { type: "AI_MATERIAL", sortOrder: 10 },
  { type: "GITHUB_REPO", sortOrder: 20 },
  { type: "MCP_SERVER", sortOrder: 30 },
  { type: "SKILL", sortOrder: 40 },
  { type: "DEV_NOTE", sortOrder: 50 },
  { type: "PROMPT", sortOrder: 60 },
];

/** 초기 카테고리 (REQ-04 · 4.5절). 깊이 2단계까지 */
const CATEGORIES: {
  slug: string;
  name: string;
  icon: string;
  children: { slug: string; name: string }[];
}[] = [
  {
    slug: "ai-model",
    name: "AI · 모델",
    icon: "brain",
    children: [
      { slug: "llm", name: "LLM" },
      { slug: "vision", name: "비전" },
      { slug: "speech", name: "음성" },
      { slug: "multimodal", name: "멀티모달" },
      { slug: "fine-tuning", name: "파인튜닝" },
    ],
  },
  {
    slug: "ai-tools",
    name: "AI 도구",
    icon: "wrench",
    children: [
      { slug: "agent", name: "에이전트" },
      { slug: "mcp", name: "MCP" },
      { slug: "skill", name: "Skill" },
      { slug: "prompt", name: "프롬프트" },
      { slug: "coding-tools", name: "코딩 도구" },
    ],
  },
  {
    slug: "geospatial",
    name: "공간정보",
    icon: "map",
    children: [
      { slug: "drone-capture", name: "드론 촬영" },
      { slug: "pointcloud", name: "포인트클라우드" },
      { slug: "gis", name: "GIS" },
      { slug: "photogrammetry", name: "사진측량" },
      { slug: "cartography", name: "지도" },
    ],
  },
  {
    slug: "dev",
    name: "개발",
    icon: "code",
    children: [
      { slug: "frontend", name: "프론트엔드" },
      { slug: "backend", name: "백엔드" },
      { slug: "infra", name: "인프라" },
      { slug: "data", name: "데이터" },
    ],
  },
  {
    slug: "internal",
    name: "사내",
    icon: "building",
    children: [
      { slug: "convention", name: "규약" },
      { slug: "onboarding", name: "온보딩" },
      { slug: "retro", name: "회고" },
    ],
  },
];

/**
 * 시스템 설정 기본값 (DEV-02 · 2.3절).
 *
 * `value` 는 **NOT NULL 인 jsonb** 이므로 «값 없음»은 JS `null` 이 아니라
 * `Prisma.JsonNull`(= JSON 의 null)로 써야 합니다. `undefined` 를 넘기면
 * Prisma 가 «필드를 지정하지 않았다»로 보고 거부합니다.
 */
/*
 * **시스템 설정을 시드하지 않습니다** (`DEC-059`).
 *
 * 전에는 아홉 개를 넣었는데, 그중 **여덟 개를 아무도 읽지 않았습니다** —
 * 시드는 `upload.max_mb` 를 쓰고 코드는 `upload.maxMb` 를 읽습니다.
 * 나머지도 코드 상수(`ARCHIVE_LIMIT_BYTES`·`RETAIN_MS`)이거나 환경변수에서
 * 파생되는 값이었습니다.
 *
 * 그리고 **읽는 키조차 넣으면 안 됩니다.** `DEC-059` 의 규칙이
 * 「행이 있으면 DB 가 이기고, 없으면 `.env`」이므로, 아무도 안 바꾼 값에 행이
 * 있으면 설정 화면이 **「이 화면에서 정한 값」이라고 거짓말**합니다.
 *
 * 설정의 기본값은 `features/admin/settings.schema.ts` + `.env` 한 벌입니다.
 */

/** `server/auth/password.ts` 와 **같은 파라미터**여야 합니다 (측정 기준 49ms) */
const ARGON2 = {
  algorithm: 2,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
} as const;

/**
 * 최초 관리자 (REQ-02 · 2.2절, FR-AUTH-011).
 *
 * **둘 중 하나만 있으면 명시적으로 죽습니다.** 조용히 건너뛰면
 * 「시드했는데 로그인이 안 된다」가 됩니다.
 */
async function seedAdmin() {
  const id = process.env.ADMIN_SEED_ID;
  const password = process.env.ADMIN_SEED_PASSWORD;

  if (!id && !password) {
    console.log("관리자 시드: ADMIN_SEED_* 가 없어 건너뜁니다.");
    return;
  }
  if (!id || !password) {
    throw new Error(
      "ADMIN_SEED_ID 와 ADMIN_SEED_PASSWORD 는 **둘 다** 있어야 합니다."
    );
  }
  // `lib/env.ts` 의 규칙(최소 10자)이 시드 경로에는 적용되지 않으므로 여기서 다시 본다.
  // 이 검사가 없으면 3자짜리 관리자 비밀번호가 조용히 통과한다.
  if (password.length < 10) {
    throw new Error("ADMIN_SEED_PASSWORD 는 10자 이상이어야 합니다.");
  }

  const username = id.toLowerCase();
  await db.user.upsert({
    where: { username },
    // **이미 있으면 비밀번호를 되돌리지 않습니다.** 관리자가 바꾼 값을 시드가 초기화하면 안 됩니다.
    update: {},
    create: {
      username,
      passwordHash: await hash(password, ARGON2),
      name: "관리자",
      status: "ACTIVE",
      // 최초 로그인 시 변경 강제 (FR-AUTH-011)
      mustChangePassword: true,
    },
  });
  console.log(`관리자 시드: ${username} (최초 로그인 시 비밀번호 변경 강제)`);
}

/**
 * 개발 전용 계정 — 「남이 만든 것」이 있는 화면을 확인할 때 씁니다.
 *
 * 🔄 「역할별 화면을 확인할 때」였습니다. `DEC-077` 로 등급이 사라져 두 계정의
 *    차이는 **이름·소속과 «누가 만들었나»** 뿐입니다.
 *
 * 프로토타입의 «사용자 전환기»를 대체합니다. 전환기 대신 **실제 로그아웃 → 로그인**으로
 * 확인하면 그 경로가 곧 E2E ①·④ 라 테스트를 따로 만들지 않아도 됩니다.
 *
 * **`NODE_ENV !== "production"` 로 판정하지 않습니다.** 시드는 `next` 와 다른
 * 프로세스(`tsx`)라 `NODE_ENV` 가 대개 비어 있고, `.env` 에 `NODE_ENV=production` 을
 * 적는 사람도 없습니다. 그러면 **운영 서버에서 관리자 계정을 만들려고 시드를 돌리는 순간**
 * 공개된 비밀번호를 가진 계정이 둘 생깁니다 — `DEC-077` 뒤에는 그 둘도 관리자입니다.
 * 「안 돈다」가 기본값에 대한 낙관이 되지 않도록 **명시적 옵트인**으로 뒤집습니다.
 */
async function seedDevUsers() {
  if (process.env.SEED_DEV_USERS !== "true") return;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "운영 환경에서는 개발 계정을 만들 수 없습니다. SEED_DEV_USERS 를 지우세요."
    );
  }

  const passwordHash = await hash("neowave-work-dev-1234", ARGON2);
  const users = [
    { username: "minsu", name: "박민수", department: "개발팀" },
    { username: "seoyeon", name: "이서연", department: "공간정보팀" },
  ] as const;

  for (const u of users) {
    await db.user.upsert({
      where: { username: u.username },
      update: {},
      create: { ...u, passwordHash, status: "ACTIVE" },
    });
  }
  // 비밀번호를 stdout 에 찍지 않는다 — CI 로그·터미널 기록에 남는다 (NFR-LOG-003).
  // 값은 `.env.example` 주석에 적어 둔다.
  console.log("개발 계정: minsu(MEMBER) · seoyeon(EDITOR) 생성/확인");
}

async function main() {
  await seedAdmin();
  await seedDevUsers();

  // ── 콘텐츠 타입 운영 설정 ──────────────────────────────
  for (const { type, sortOrder } of CONTENT_TYPES) {
    await db.contentTypeSetting.upsert({
      where: { type },
      // 이미 있으면 **건드리지 않습니다** — 관리자가 바꿔 둔 값을 시드가 되돌리면 안 됩니다.
      update: {},
      create: { type, sortOrder, isActive: true, showInNav: true },
    });
  }

  // ── 카테고리 (대분류 → 소분류) ─────────────────────────
  for (const [i, parent] of CATEGORIES.entries()) {
    const created = await db.category.upsert({
      where: { slug: parent.slug },
      update: {},
      create: {
        slug: parent.slug,
        name: parent.name,
        icon: parent.icon,
        sortOrder: (i + 1) * 10,
      },
    });

    for (const [j, child] of parent.children.entries()) {
      await db.category.upsert({
        where: { slug: child.slug },
        update: {},
        create: {
          slug: child.slug,
          name: child.name,
          parentId: created.id,
          sortOrder: (j + 1) * 10,
        },
      });
    }
  }

  const [types, categories] = await Promise.all([
    db.contentTypeSetting.count(),
    db.category.count(),
  ]);

  console.log(`시드 완료 — 콘텐츠 타입 ${types} · 카테고리 ${categories}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
