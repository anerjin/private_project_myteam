/**
 * 목업·검증 데이터 정리 — **오픈 전 한 번** (`DEC-026` 초기 자료 수집 직전).
 *
 *   npm run purge:mock            미리보기 (아무것도 안 지움)
 *   npm run purge:mock -- --apply 실제 삭제
 *
 * ## 기본이 «미리보기»입니다
 *
 * 되돌릴 수 없는 조작이고, 무엇이 지워지는지 보고 나서 누르는 것과 안 보고
 * 누르는 것은 다릅니다. `--apply` 를 손으로 붙이는 그 동작이 확인입니다.
 *
 * ## 무엇을 남기는가
 *
 * | 남김 | 이유 |
 * | --- | --- |
 * | `admin` 계정 | 지우면 아무도 못 들어옵니다 |
 * | 카테고리 27 | `REQ-04` 가 정의한 **운영 데이터**입니다. 목이 아닙니다 |
 * | 콘텐츠 타입 설정 | 같은 이유 |
 * | `neowave-work-collect` Skill 자료 | `M3` DoD 의 「자기 참조」 — 실제 자산입니다 |
 *
 * ## 무엇을 지우는가
 *
 * 검증이 남긴 계정·작업·감사 로그·알림, 개발용 가짜 사람(`minsu`·`seoyeon`),
 * 그리고 **코드가 읽지 않는 `system_settings` 행**.
 *
 * 마지막 것이 이 스크립트를 만들게 된 이유의 절반입니다 — 시드가
 * `upload.max_mb` 를 쓰는데 코드는 `upload.maxMb` 를 읽습니다. 아무도 안 읽는
 * 행이 아홉 개 있었고, 그것이 설정 화면에서 「이 화면에서 정한 값」처럼 보일
 * 뻔했습니다 (`DEC-059`: 행이 없으면 `.env` 가 기본값).
 */
import { SETTING_KEYS } from "@/features/admin/settings.schema";
import { db } from "@/lib/db";

const APPLY = process.argv.includes("--apply");

/** 검증 스크립트가 만드는 계정의 접두사 — 각 `verify-*.ts` 의 `mkUser` 와 같은 것 */
const TEST_PREFIXES = [
  "vp3_",
  "vp4_",
  "vp5_",
  "vp6_",
  "vp7_",
  "vp7m_",
  "vp8_",
  "vempty_",
  "probe_",
];

/** 개발용 가짜 사람 — 시드가 `SEED_DEV_USERS=true` 일 때만 만든다 */
const DEV_USERNAMES = ["minsu", "seoyeon"];

interface Plan {
  label: string;
  count: number;
  detail?: string;
  run: () => Promise<void>;
}

async function main() {
  const plans: Plan[] = [];

  /* ── 1. 검증 잔여 계정 ──────────────────────────────────────────── */
  const testUsers = await db.user.findMany({
    where: { OR: TEST_PREFIXES.map((p) => ({ username: { startsWith: p } })) },
    select: { id: true, username: true },
  });
  if (testUsers.length > 0) {
    const ids = testUsers.map((u) => u.id);
    plans.push({
      label: "검증 잔여 계정",
      count: testUsers.length,
      detail: testUsers.map((u) => u.username).join(", "),
      run: async () => {
        await removeUsers(ids);
      },
    });
  }

  /* ── 2. 개발용 가짜 사람 ────────────────────────────────────────── */
  const devUsers = await db.user.findMany({
    where: { username: { in: DEV_USERNAMES } },
    select: { id: true, username: true, name: true },
  });
  if (devUsers.length > 0) {
    plans.push({
      label: "개발용 계정 (가짜 사람)",
      count: devUsers.length,
      detail: devUsers.map((u) => `${u.name}(@${u.username})`).join(", "),
      run: async () => {
        /*
         * **자료는 남기고 작성자만 옮깁니다.** `neowave-work-collect` Skill 이
         * `seoyeon` 소유인데, 그건 실제 자산입니다 — 계정을 지운다고 자료가
         * 사라지면 안 됩니다.
         */
        const keeper = await db.user.findFirst({
          where: { status: "ACTIVE", username: { notIn: DEV_USERNAMES } },
          select: { id: true },
        });
        if (!keeper) {
          throw new Error(
            "옮겨 둘 계정이 없습니다. 개발용 계정을 지우면 자료가 고아가 됩니다."
          );
        }
        await db.resource.updateMany({
          where: { authorId: { in: devUsers.map((u) => u.id) } },
          data: { authorId: keeper.id },
        });
        await db.collection.updateMany({
          where: { ownerId: { in: devUsers.map((u) => u.id) } },
          data: { ownerId: keeper.id },
        });
        await removeUsers(devUsers.map((u) => u.id));
      },
    });
  }

  /* ── 3. 작업 기록 ───────────────────────────────────────────────── */
  const jobs = await db.job.count();
  if (jobs > 0) {
    plans.push({
      label: "작업 기록",
      count: jobs,
      detail:
        "전부 검증이 만든 것. 스케줄의 «마지막 실행»도 함께 사라져 다음 실행이 밀린 것으로 잡힙니다",
      run: async () => {
        await db.job.deleteMany({});
      },
    });
  }

  /* ── 4. 감사 로그 ───────────────────────────────────────────────── */
  const audit = await db.auditLog.count();
  if (audit > 0) {
    plans.push({
      label: "감사 로그",
      count: audit,
      detail:
        "오픈 전이라 전부 검증 기록입니다. **오픈 뒤에는 이 스크립트를 쓰지 마십시오** — 보존 1년은 배치가 지킵니다",
      run: async () => {
        await db.auditLog.deleteMany({});
      },
    });
  }

  /* ── 5. 알림 ────────────────────────────────────────────────────── */
  const notifications = await db.notification.count();
  if (notifications > 0) {
    plans.push({
      label: "알림",
      count: notifications,
      run: async () => {
        await db.notification.deleteMany({});
      },
    });
  }

  /* ── 6. 코드가 읽지 않는 시스템 설정 ───────────────────────────── */
  const known = new Set<string>(SETTING_KEYS);
  const settings = await db.systemSetting.findMany({ select: { key: true } });
  const orphanKeys = settings.map((s) => s.key).filter((k) => !known.has(k));
  if (orphanKeys.length > 0) {
    plans.push({
      label: "아무도 안 읽는 설정 행",
      count: orphanKeys.length,
      detail: orphanKeys.join(", "),
      run: async () => {
        await db.systemSetting.deleteMany({
          where: { key: { in: orphanKeys } },
        });
      },
    });
  }

  /*
   * **읽는 키의 행도 지웁니다.** `DEC-059` 가 「행이 없으면 `.env` 가 기본값」
   * 이라고 정했으므로, 아무도 안 바꾼 값에 행이 있으면 설정 화면이
   * 「이 화면에서 정한 값」이라고 **거짓말**합니다.
   */
  const seeded = settings.map((s) => s.key).filter((k) => known.has(k));
  if (seeded.length > 0) {
    plans.push({
      label: "시드가 넣은 기본값 행",
      count: seeded.length,
      detail: `${seeded.join(", ")} — 지우면 «환경변수의 기본값»으로 되돌아갑니다`,
      run: async () => {
        await db.systemSetting.deleteMany({ where: { key: { in: seeded } } });
      },
    });
  }

  /* ── 7. 안 쓰는 태그 ────────────────────────────────────────────── */
  const unusedTags = await db.tag.findMany({
    where: { resources: { none: {} } },
    select: { slug: true },
  });
  if (unusedTags.length > 0) {
    plans.push({
      label: "안 쓰는 태그",
      count: unusedTags.length,
      detail: unusedTags.map((t) => `#${t.slug}`).join(", "),
      run: async () => {
        await db.tag.deleteMany({ where: { resources: { none: {} } } });
      },
    });
  }

  /* ── 보고 ───────────────────────────────────────────────────────── */
  console.log(
    APPLY ? "목업 데이터를 지웁니다\n" : "미리보기 — 아무것도 지우지 않습니다\n"
  );

  if (plans.length === 0) {
    console.log("  지울 것이 없습니다.");
  }
  for (const p of plans) {
    console.log(`  ${p.label} — ${p.count}건`);
    if (p.detail) console.log(`     ${p.detail}`);
  }

  const kept = await keepSummary();
  console.log("\n남기는 것");
  for (const [k, v] of Object.entries(kept)) console.log(`  ${k}: ${v}`);

  if (!APPLY) {
    console.log("\n실제로 지우려면: npm run purge:mock -- --apply");
    await db.$disconnect();
    process.exit(0);
  }

  for (const p of plans) {
    await p.run();
    console.log(`  ✓ ${p.label}`);
  }

  /*
   * **마지막에 다시 셉니다.** 「지웠다」가 아니라 **「지금 어떤가」**를
   * 보여줍니다 — 지우는 도중에 무언가 막혔어도 숫자가 말해 줍니다.
   */
  const active = await db.user.count({ where: { status: "ACTIVE" } });
  if (active === 0) {
    throw new Error(
      "활성 계정이 0개가 됐습니다. 시드로 관리자를 다시 만드십시오: npx prisma db seed"
    );
  }
  console.log(
    `\n끝. 활성 계정 ${active}개 · ${JSON.stringify(await keepSummary())}`
  );

  await db.$disconnect();
  process.exit(0);
}

/**
 * 계정을 지운다 — **딸린 것을 순서대로 먼저.**
 *
 * `files.uploaded_by` 는 `onDelete` 가 없어(기본 `Restrict`) 사용자 삭제를
 * 막습니다. `verify-p6` 가 그 순서를 몰라 계정 둘을 남겼고, 그것이 이
 * 스크립트를 만들게 된 나머지 절반입니다.
 */
async function removeUsers(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.resourceFile.deleteMany({
    where: { file: { uploadedById: { in: ids } } },
  });
  await db.file.deleteMany({ where: { uploadedById: { in: ids } } });
  await db.session.deleteMany({ where: { userId: { in: ids } } });
  await db.apiKey.deleteMany({ where: { userId: { in: ids } } });
  await db.notification.deleteMany({ where: { userId: { in: ids } } });
  await db.bookmark.deleteMany({ where: { userId: { in: ids } } });
  await db.collectionItem.deleteMany({
    where: { collection: { ownerId: { in: ids } } },
  });
  await db.collection.deleteMany({ where: { ownerId: { in: ids } } });
  await db.resource.deleteMany({ where: { authorId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
}

async function keepSummary(): Promise<Record<string, number>> {
  const [users, resources, categories, types] = await Promise.all([
    db.user.count(),
    db.resource.count(),
    db.category.count(),
    db.contentTypeSetting.count(),
  ]);
  return {
    계정: users,
    자료: resources,
    카테고리: categories,
    타입설정: types,
  };
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
