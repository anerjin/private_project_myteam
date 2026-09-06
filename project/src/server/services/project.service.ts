import "server-only";

import type { Prisma } from "@prisma/client";

import {
  fromDate,
  toDate,
  type ProjectInput,
} from "@/features/projects/schema";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { isAdmin, type Actor } from "@/server/auth/actor";
import * as audit from "@/server/services/audit.service";

/**
 * 프로젝트 (`FR-PROJ-001`~`004` · `DEC-069`).
 *
 * ## 자료가 아닙니다
 *
 * `resources` 를 쓰지 않습니다. 자료는 «바깥 어떤 것에 대한 문서»이고
 * 프로젝트는 «일을 담는 그릇»입니다 — 분류·태그·중복 검사·수집 채널·
 * 아카이브가 하나도 안 맞습니다.
 *
 * ## 「누가 볼 수 있는가」가 없습니다
 *
 * **승인된 회원 전원이 전부 봅니다** (`DEC-018`, 운영자 재확인 2026-09-04).
 * 그래서 조회에 `ownerId` 조건이 **없습니다** — 개인 메모(`note.service`)와
 * 정반대입니다. 거기서는 `where` 에 `ownerId` 를 넣는 것이 규칙이고,
 * 여기서는 **넣지 않는 것**이 규칙입니다.
 *
 * `ownerId` 는 **지울 권한에만** 쓰입니다. 고치는 것도 전원입니다 —
 * 20명이 한 팀이고, 「내가 만든 프로젝트만 내가 고친다」는 그 규모에서
 * 서로를 기다리게 만듭니다.
 *
 * ## 감사 로그는 «그릇»만 남깁니다
 *
 * 만들고 지우는 것은 팀 모두에게 보이는 구조 변경이라 남깁니다. 안의 문서를
 * 고치는 것은 글쓰기라 남기지 않습니다 (`features/audit/actions` 주석).
 */

export interface ProjectSummary {
  id: string;
  slug: string;
  name: string;
  description?: string;
  status: string;
  startsOn?: string;
  endsOn?: string;
  owner: { id: string; name: string; username: string };
  docCount: number;
  taskCount: number;
  /** 완료한 할 일 수 — 목록의 진행률이 이것으로 계산됩니다 */
  doneCount: number;
  updatedAt: string;
  deletedAt?: string;
}

const CARD = {
  id: true,
  slug: true,
  name: true,
  description: true,
  status: true,
  startsOn: true,
  endsOn: true,
  updatedAt: true,
  deletedAt: true,
  owner: { select: { id: true, name: true, username: true } },
} as const;

type Row = Prisma.ProjectGetPayload<{ select: typeof CARD }>;

function toSummary(
  p: Row,
  counts: { docs: number; tasks: number; done: number }
): ProjectSummary {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description ?? undefined,
    status: p.status,
    startsOn: fromDate(p.startsOn),
    endsOn: fromDate(p.endsOn),
    owner: p.owner,
    docCount: counts.docs,
    taskCount: counts.tasks,
    doneCount: counts.done,
    updatedAt: p.updatedAt.toISOString(),
    deletedAt: p.deletedAt?.toISOString(),
  };
}

/**
 * 세는 것을 **한 번에** 합니다.
 *
 * 카드마다 물으면 프로젝트 20개에 60번의 추가 질의가 됩니다(N+1). 자료 목록이
 * 북마크 여부를 `IN` 한 번으로 채우는 것과 같은 자리입니다
 * (`resource.service.bookmarkedIds`).
 *
 * 문서·할 일 각각 `groupBy` 를 한 번씩만 돌립니다.
 */
async function countsFor(ids: string[]) {
  const empty = { docs: 0, tasks: 0, done: 0 };
  if (ids.length === 0) return new Map<string, typeof empty>();

  const [docs, tasks, done] = await Promise.all([
    db.projectDoc.groupBy({
      by: ["projectId"],
      where: { projectId: { in: ids }, deletedAt: null },
      _count: { _all: true },
    }),
    db.projectTask.groupBy({
      by: ["projectId"],
      where: { projectId: { in: ids } },
      _count: { _all: true },
    }),
    db.projectTask.groupBy({
      by: ["projectId"],
      where: { projectId: { in: ids }, status: "DONE" },
      _count: { _all: true },
    }),
  ]);

  const map = new Map<string, { docs: number; tasks: number; done: number }>();
  for (const id of ids) map.set(id, { ...empty });
  for (const r of docs) map.get(r.projectId)!.docs = r._count._all;
  for (const r of tasks) map.get(r.projectId)!.tasks = r._count._all;
  for (const r of done) map.get(r.projectId)!.done = r._count._all;
  return map;
}

/** 목록 (`FR-PROJ-001`) — **전원이 전부 봅니다.** 휴지통은 `trash` 로 */
export async function list(trash = false): Promise<ProjectSummary[]> {
  const rows = await db.project.findMany({
    where: { deletedAt: trash ? { not: null } : null },
    orderBy: trash
      ? { deletedAt: "desc" }
      : [{ status: "asc" }, { updatedAt: "desc" }],
    select: CARD,
  });
  const counts = await countsFor(rows.map((r) => r.id));
  return rows.map((r) =>
    toSummary(r, counts.get(r.id) ?? { docs: 0, tasks: 0, done: 0 })
  );
}

export async function countLive(): Promise<number> {
  return db.project.count({ where: { deletedAt: null } });
}

export async function countTrash(): Promise<number> {
  return db.project.count({ where: { deletedAt: { not: null } } });
}

/** 주소의 slug 로 하나 (`FR-PROJ-003`). 휴지통에 있는 것은 열리지 않습니다 */
export async function getBySlug(slug: string): Promise<ProjectSummary> {
  const row = await db.project.findFirst({
    where: { slug, deletedAt: null },
    select: CARD,
  });
  if (!row) throw new AppError("NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
  const counts = await countsFor([row.id]);
  return toSummary(row, counts.get(row.id)!);
}

/**
 * 빵부스러기에 쓸 이름. **없으면 `null`** — 던지지 않습니다.
 *
 * 빵부스러기는 화면 전체에 있고, 거기서 던지면 모든 화면이 죽습니다
 * (`note.service.titleFor` 와 같은 규칙).
 */
export async function nameBySlug(slug: string): Promise<string | null> {
  const row = await db.project.findFirst({
    where: { slug, deletedAt: null },
    select: { name: true },
  });
  return row?.name ?? null;
}

/**
 * slug 생성.
 *
 * **한글을 버리지 않습니다.** 자료 slug 가 같은 자리에서 한 번 망가졌습니다 —
 * 라틴 문자만 남기면 「사내 포털 개편」이 빈 문자열이 됩니다
 * (`resource.write.toSlug` 주석). 규칙은 같지만 그쪽은 `ResourceType` 을
 * 받으므로 여기서 다시 씁니다.
 */
function toSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, " ")
    .trim()
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug.length >= 2
    ? slug
    : `project-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 충돌하면 `-2`, `-3` …
 *
 * **이 조회가 경합을 막지는 못합니다.** 같은 이름을 동시에 만들면 둘 다
 * 「비어 있다」로 보고 뒤엣것이 유니크 제약에 걸립니다 — 최종 방어선은 DB 이고
 * 호출부가 잡아 재시도합니다 (`resource.write.slugCandidate` 와 같은 규칙).
 */
async function uniqueSlug(name: string): Promise<string> {
  const base = toSlug(name);
  for (let i = 1; i <= 20; i += 1) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    const taken = await db.project.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function create(
  actor: Actor,
  input: ProjectInput
): Promise<{ id: string; slug: string }> {
  const slug = await uniqueSlug(input.name);

  return db.$transaction(async (tx) => {
    const made = await tx.project.create({
      data: {
        slug,
        name: input.name,
        description: input.description || null,
        status: input.status,
        startsOn: toDate(input.startsOn),
        endsOn: toDate(input.endsOn),
        ownerId: actor.id,
      },
      select: { id: true, slug: true },
    });

    // 감사 로그는 **본 작업과 같은 트랜잭션**에 (`DEC-043`)
    await audit.log(
      actor,
      {
        action: "PROJECT_CREATE",
        targetType: "project",
        targetId: made.id,
        summary: `프로젝트 「${input.name}」 생성`,
      },
      tx
    );
    return made;
  });
}

export async function update(
  actor: Actor,
  id: string,
  input: ProjectInput
): Promise<void> {
  const before = await db.project.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!before) throw new AppError("NOT_FOUND", "프로젝트를 찾을 수 없습니다.");

  await db.$transaction(async (tx) => {
    await tx.project.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description || null,
        status: input.status,
        startsOn: toDate(input.startsOn),
        endsOn: toDate(input.endsOn),
      },
    });
    await audit.log(
      actor,
      {
        action: "PROJECT_UPDATE",
        targetType: "project",
        targetId: id,
        summary: `프로젝트 「${input.name}」 수정`,
        ...(before.name !== input.name
          ? { diff: { name: { before: before.name, after: input.name } } }
          : {}),
      },
      tx
    );
  });
}

/**
 * 지울 수 있는가 — **소유자와 `ADMIN`** (`FR-PROJ-004`).
 *
 * 고치는 것과 다릅니다. 삭제는 **남의 문서와 일정을 함께 감춥니다** —
 * 되돌릴 수 있어도 그동안 아무도 못 봅니다.
 */
function assertCanDelete(actor: Actor, ownerId: string): void {
  if (actor.id === ownerId || isAdmin(actor)) return;
  throw new AppError(
    "FORBIDDEN",
    "프로젝트는 만든 사람과 관리자만 삭제할 수 있습니다."
  );
}

/** 휴지통으로 (`FR-PROJ-004`) — **지우지 않습니다** */
export async function moveToTrash(actor: Actor, id: string): Promise<void> {
  const row = await db.project.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, name: true, ownerId: true },
  });
  if (!row) throw new AppError("NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
  assertCanDelete(actor, row.ownerId);

  await db.$transaction(async (tx) => {
    await tx.project.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit.log(
      actor,
      {
        action: "PROJECT_DELETE",
        targetType: "project",
        targetId: id,
        summary: `프로젝트 「${row.name}」 휴지통으로`,
      },
      tx
    );
  });
}

export async function restore(actor: Actor, id: string): Promise<void> {
  const row = await db.project.findFirst({
    where: { id, deletedAt: { not: null } },
    select: { id: true, name: true, ownerId: true },
  });
  if (!row) throw new AppError("NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
  assertCanDelete(actor, row.ownerId);

  await db.$transaction(async (tx) => {
    await tx.project.update({ where: { id }, data: { deletedAt: null } });
    await audit.log(
      actor,
      {
        action: "PROJECT_RESTORE",
        targetType: "project",
        targetId: id,
        summary: `프로젝트 「${row.name}」 복구`,
      },
      tx
    );
  });
}

/**
 * 담당자로 고를 수 있는 사람 (`FR-PROJ-013`).
 *
 * **승인된 계정만**입니다. 정지·탈퇴한 사람에게 일을 맡길 수는 없습니다.
 */
export async function assignableMembers(): Promise<
  { id: string; name: string; username: string }[]
> {
  return db.user.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, username: true },
  });
}
