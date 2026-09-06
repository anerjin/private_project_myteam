import "server-only";

import type { ProjectSection } from "@prisma/client";

import type { ProjectDocInput } from "@/features/projects/schema";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/server/auth/actor";

/**
 * 프로젝트 문서 (`FR-PROJ-005`~`009` · `DEC-069`).
 *
 * ## 자료가 아니라 «우리가 쓰는 글»입니다
 *
 * `resources` 에 넣지 않기로 한 결정(운영자, 2026-09-04)의 실제 모습이
 * 이 파일입니다. 그래서 **분류·태그·중복 검사·수집 채널·통합 검색이 전부
 * 없습니다.** 마크다운 렌더러(`MarkdownViewer`)만 자료와 함께 씁니다 —
 * 그건 «표현»이지 «카탈로그»가 아닙니다.
 *
 * ## 감사 로그를 남기지 않습니다
 *
 * 문서를 고치는 것은 글쓰기입니다. 남기면 관리자 화면에 「누가 몇 번
 * 고쳤는지」가 흐릅니다 — 개인 메모를 기록하지 않는 것과 같은 선입니다
 * (`features/audit/actions` 주석). 대신 **판을 그대로 남깁니다**.
 */

export interface DocSummary {
  id: string;
  title: string;
  /** 목록에 실을 첫 줄. 본문 전체를 목록에 싣지 않습니다 */
  excerpt: string;
  sortOrder: number;
  updatedAt: string;
  author: { id: string; name: string };
}

export interface Doc extends DocSummary {
  section: ProjectSection;
  body: string;
  projectId: string;
  versionCount: number;
}

const EXCERPT = 120;

const CARD = {
  id: true,
  title: true,
  body: true,
  sortOrder: true,
  updatedAt: true,
  author: { select: { id: true, name: true } },
} as const;

function toSummary(r: {
  id: string;
  title: string;
  body: string | null;
  sortOrder: number;
  updatedAt: Date;
  author: { id: string; name: string };
}): DocSummary {
  return {
    id: r.id,
    title: r.title,
    excerpt: (r.body ?? "").replace(/\s+/g, " ").trim().slice(0, EXCERPT),
    sortOrder: r.sortOrder,
    updatedAt: r.updatedAt.toISOString(),
    author: r.author,
  };
}

/** 한 구획의 문서 목록 (`FR-PROJ-007`) — **사람이 정한 순서대로** */
export async function listFor(
  projectId: string,
  section: ProjectSection
): Promise<DocSummary[]> {
  const rows = await db.projectDoc.findMany({
    where: { projectId, section, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: CARD,
  });
  return rows.map(toSummary);
}

/** 구획별 문서 수 — 개요 화면이 한 번에 묻습니다 (`FR-PROJ-003`) */
export async function countsBySection(
  projectId: string
): Promise<Record<ProjectSection, number>> {
  const rows = await db.projectDoc.groupBy({
    by: ["section"],
    where: { projectId, deletedAt: null },
    _count: { _all: true },
  });
  const out = { PLAN: 0, DESIGN: 0, DEV: 0 } as Record<ProjectSection, number>;
  for (const r of rows) out[r.section] = r._count._all;
  return out;
}

export async function get(id: string): Promise<Doc> {
  const row = await db.projectDoc.findFirst({
    where: { id, deletedAt: null },
    select: {
      ...CARD,
      section: true,
      projectId: true,
      _count: { select: { versions: true } },
    },
  });
  if (!row) throw new AppError("NOT_FOUND", "문서를 찾을 수 없습니다.");
  return {
    ...toSummary(row),
    section: row.section,
    projectId: row.projectId,
    body: row.body ?? "",
    versionCount: row._count.versions,
  };
}

/**
 * 새 문서는 **구획의 맨 뒤**에 붙습니다.
 *
 * `max(sortOrder) + 1` 을 씁니다. 개수를 세면 중간을 지운 뒤에 번호가 겹칩니다.
 */
export async function create(
  actor: Actor,
  projectId: string,
  input: ProjectDocInput
): Promise<{ id: string }> {
  const last = await db.projectDoc.aggregate({
    where: { projectId, section: input.section },
    _max: { sortOrder: true },
  });

  return db.projectDoc.create({
    data: {
      projectId,
      section: input.section,
      title: input.title,
      body: input.body || null,
      sortOrder: (last._max.sortOrder ?? -1) + 1,
      authorId: actor.id,
    },
    select: { id: true },
  });
}

/**
 * 고친다 (`FR-PROJ-006`) — **고치기 «전»의 판을 남깁니다** (`FR-PROJ-009`).
 *
 * 순서가 중요합니다. 새 값을 쓴 뒤에 남기면 **바뀐 값이 이력에 들어갑니다.**
 * 한 트랜잭션으로 묶어 둘 중 하나만 되는 일이 없게 합니다.
 */
export async function update(
  actor: Actor,
  id: string,
  input: ProjectDocInput
): Promise<void> {
  const before = await db.projectDoc.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, title: true, body: true, section: true },
  });
  if (!before) throw new AppError("NOT_FOUND", "문서를 찾을 수 없습니다.");

  const unchanged =
    before.title === input.title && (before.body ?? "") === input.body;

  await db.$transaction(async (tx) => {
    /*
     * **안 바뀌었으면 판을 만들지 않습니다.** 저장 단추를 두 번 누르면
     * 같은 내용의 판이 둘 생기고, 이력이 금방 못 읽는 목록이 됩니다.
     */
    if (!unchanged) {
      await tx.projectDocVersion.create({
        data: {
          docId: id,
          title: before.title,
          body: before.body,
          // 계정이 지워져도 이력은 남아야 하므로 이름을 «찍어» 둡니다
          editedBy: actor.username,
        },
      });
    }
    await tx.projectDoc.update({
      where: { id },
      data: {
        // 구획은 여기서 안 바꿉니다 — 옮기는 것은 `moveToSection` 이 합니다
        title: input.title,
        body: input.body || null,
      },
    });
  });
}

/** 다른 구획으로 옮긴다. **맨 뒤에 붙습니다** */
export async function moveToSection(
  id: string,
  section: ProjectSection
): Promise<void> {
  const doc = await db.projectDoc.findFirst({
    where: { id, deletedAt: null },
    select: { projectId: true },
  });
  if (!doc) throw new AppError("NOT_FOUND", "문서를 찾을 수 없습니다.");

  const last = await db.projectDoc.aggregate({
    where: { projectId: doc.projectId, section },
    _max: { sortOrder: true },
  });
  await db.projectDoc.update({
    where: { id },
    data: { section, sortOrder: (last._max.sortOrder ?? -1) + 1 },
  });
}

/**
 * 순서를 바꾼다 (`FR-PROJ-007`).
 *
 * **받은 배열이 정본입니다.** 「위로/아래로」로 한 칸씩 옮기면 두 행을 서로
 * 바꾸는 질의가 되는데, 같은 값이 중복돼 있을 때 조용히 어긋납니다. 화면이
 * 최종 순서를 통째로 보내고 여기서 0부터 다시 매깁니다.
 */
export async function reorder(
  projectId: string,
  section: ProjectSection,
  orderedIds: string[]
): Promise<void> {
  const rows = await db.projectDoc.findMany({
    where: { projectId, section, deletedAt: null },
    select: { id: true },
  });
  const known = new Set(rows.map((r) => r.id));
  /*
   * **남의 문서 id 를 섞어 보내도 안 됩니다.** 이 프로젝트·구획의 것만
   * 반영합니다 — 걸러 내지 않으면 다른 프로젝트의 순서가 밀립니다.
   */
  const ids = orderedIds.filter((id) => known.has(id));

  await db.$transaction(
    ids.map((id, i) =>
      db.projectDoc.update({ where: { id }, data: { sortOrder: i } })
    )
  );
}

/** 휴지통으로 (`FR-PROJ-008`) */
export async function moveToTrash(id: string): Promise<void> {
  const { count } = await db.projectDoc.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (count === 0) throw new AppError("NOT_FOUND", "문서를 찾을 수 없습니다.");
}

export async function restore(id: string): Promise<void> {
  const { count } = await db.projectDoc.updateMany({
    where: { id, deletedAt: { not: null } },
    data: { deletedAt: null },
  });
  if (count === 0) throw new AppError("NOT_FOUND", "문서를 찾을 수 없습니다.");
}

/** 프로젝트 휴지통에 든 문서 — 되살릴 목록입니다 */
export async function listTrash(projectId: string): Promise<
  (DocSummary & { section: ProjectSection; deletedAt: string })[]
> {
  const rows = await db.projectDoc.findMany({
    where: { projectId, deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
    select: { ...CARD, section: true, deletedAt: true },
  });
  return rows.map((r) => ({
    ...toSummary(r),
    section: r.section,
    deletedAt: r.deletedAt!.toISOString(),
  }));
}

export interface DocVersion {
  id: string;
  title: string;
  body: string;
  editedBy?: string;
  createdAt: string;
}

/** 판 목록 (`FR-PROJ-009`) — 최신이 앞 */
export async function listVersions(docId: string): Promise<DocVersion[]> {
  const rows = await db.projectDocVersion.findMany({
    where: { docId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      body: true,
      editedBy: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body ?? "",
    editedBy: r.editedBy ?? undefined,
    createdAt: r.createdAt.toISOString(),
  }));
}
