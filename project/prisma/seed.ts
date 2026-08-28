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
import { Prisma, PrismaClient, type ResourceType } from "@prisma/client";

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
const SYSTEM_SETTINGS: {
  key: string;
  value: Prisma.InputJsonValue | typeof Prisma.JsonNull;
}[] = [
  { key: "signup.enabled", value: true },
  { key: "upload.max_mb", value: 50 },
  { key: "archive.max_mb", value: 500 },
  { key: "archive.total_limit_gb", value: 100 },
  { key: "archive.warn_pct", value: 80 },
  { key: "disk.min_free_gb", value: 20 },
  { key: "github.token_set", value: false },
  { key: "retention.account_days", value: 365 },
  { key: "retention.audit_days", value: 365 },
  { key: "notice.banner", value: Prisma.JsonNull },
];

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

  const username = id.toLowerCase();
  await db.user.upsert({
    where: { username },
    // **이미 있으면 비밀번호를 되돌리지 않습니다.** 관리자가 바꾼 값을 시드가 초기화하면 안 됩니다.
    update: {},
    create: {
      username,
      passwordHash: await hash(password, ARGON2),
      name: "관리자",
      role: "ADMIN",
      status: "ACTIVE",
      // 최초 로그인 시 변경 강제 (FR-AUTH-011)
      mustChangePassword: true,
    },
  });
  console.log(`관리자 시드: ${username} (최초 로그인 시 비밀번호 변경 강제)`);
}

/**
 * 개발 전용 계정 — 역할별 화면을 확인할 때 씁니다.
 *
 * 프로토타입의 «사용자 전환기»를 대체합니다. 전환기 대신 **실제 로그아웃 → 로그인**으로
 * 확인하면 그 경로가 곧 E2E ①·④ 라 테스트를 따로 만들지 않아도 됩니다.
 */
async function seedDevUsers() {
  if (process.env.NODE_ENV === "production") return;

  const passwordHash = await hash("queenbee-dev-1234", ARGON2);
  const users = [
    { username: "minsu", name: "박민수", department: "개발팀", role: "MEMBER" },
    {
      username: "seoyeon",
      name: "이서연",
      department: "공간정보팀",
      role: "EDITOR",
    },
  ] as const;

  for (const u of users) {
    await db.user.upsert({
      where: { username: u.username },
      update: {},
      create: { ...u, passwordHash, status: "ACTIVE" },
    });
  }
  console.log(
    "개발 계정: minsu(MEMBER) · seoyeon(EDITOR) — 비밀번호 queenbee-dev-1234"
  );
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

  // ── 시스템 설정 ────────────────────────────────────────
  for (const { key, value } of SYSTEM_SETTINGS) {
    await db.systemSetting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }

  const [types, categories, settings] = await Promise.all([
    db.contentTypeSetting.count(),
    db.category.count(),
    db.systemSetting.count(),
  ]);

  console.log(
    `시드 완료 — 콘텐츠 타입 ${types} · 카테고리 ${categories} · 시스템 설정 ${settings}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
