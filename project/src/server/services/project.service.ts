import "server-only";

import type { Prisma } from "@prisma/client";

import {
  fromDate,
  toDate,
  type ProjectInput,
} from "@/features/projects/schema";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/server/auth/actor";
import * as audit from "@/server/services/audit.service";

/**
 * 프로젝트 (`FR-PROJ-001`~`004` · `DEC-069` · `DEC-075`).
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
 * 🔄 `ownerId` 는 **지울 권한에만** 썼습니다 — 「소유자와 `ADMIN`」이었습니다.
 *    `DEC-077` 로 사람이 전부 관리자가 되면서 그 식이 통째로 참이 되어
 *    **판정을 지웠습니다**(`assertCanDelete`). 지금 `ownerId` 가 답하는 것은
 *    「누가 만들었나」 하나이고, 그 값은 화면과 감사 로그가 씁니다.
 *
 *    지우는 힘은 여기서 나오지 않게 됐지만, **휴지통은 그대로입니다**
 *    (`FR-PROJ-004`) — 되돌릴 수 있는 것이 이 변경의 안전장치입니다.
 *
 * 🔴 **원본(Orbee)과 정확히 여기서 갈립니다.** 그쪽은 사용자별 격리 SaaS 라
 *    조회마다 `userId` 로 좁히고, 참가자 표(`ProjectMember`)와 초대가 그
 *    위에 서 있습니다. 화면은 통째로 가져왔지만 **그 조건들은 하나도 안
 *    가져왔습니다** — 우리에게는 참가자라는 개념이 없고, 흉내 내면 없는 개념을
 *    하나 만드는 것이 됩니다.
 *
 * ## `DEC-075` 에서 세는 일이 사라졌습니다
 *
 * 옛 요약에는 `docCount`·`taskCount`·`doneCount` 셋이 있었고, 그것을 채우려고
 * `groupBy` 를 세 번 돌렸습니다. 문서 표가 없어졌고 할 일 상태(`DONE`)도
 * 없어졌으므로 셋 다 잴 것이 없습니다 — 카드가 그리는 것은 이제 **기간 안에서
 * 오늘이 어디쯤인가**입니다(`features/projects/project-span.ts`). 그 값은 질의가
 * 아니라 날짜 산수라 서버가 아무것도 더 세지 않습니다.
 *
 * ## 감사 로그는 «그릇»만 남깁니다
 *
 * 만들고 지우는 것은 팀 모두에게 보이는 구조 변경이라 남깁니다. 안의 항목을
 * 고치는 것은 계획을 세우는 일이라 남기지 않습니다 (`features/audit/actions` 주석).
 */

export interface ProjectSummary {
  id: string;
  slug: string;
  name: string;
  description?: string;
  status: string;
  /** YYYY-MM-DD 또는 `undefined`(아직 안 정함) */
  startsOn?: string;
  endsOn?: string;
  owner: { id: string; name: string; username: string };
  /**
   * 만든 날(YYYY-MM-DD).
   *
   * 🔴 `Date` 가 아니라 **이미 잘린 날짜 문자열**로 내려보냅니다. 브라우저에서
   *    자르면 시간대가 다른 기기에서 하루가 밀립니다 — 컬럼은 `timestamp` 지만
   *    화면이 쓰는 것은 날짜뿐이라 자르는 일을 서버가 한 번만 합니다.
   */
  createdAt: string;
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
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  owner: { select: { id: true, name: true, username: true } },
} as const;

type Row = Prisma.ProjectGetPayload<{ select: typeof CARD }>;

function toSummary(p: Row): ProjectSummary {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description ?? undefined,
    status: p.status,
    startsOn: fromDate(p.startsOn),
    endsOn: fromDate(p.endsOn),
    owner: p.owner,
    createdAt: p.createdAt.toISOString().slice(0, 10),
    updatedAt: p.updatedAt.toISOString(),
    deletedAt: p.deletedAt?.toISOString(),
  };
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
  return rows.map(toSummary);
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
  return toSummary(row);
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

/** 프로젝트를 만든다 (`FR-PROJ-002` — 이름 필수 · 설명 · 시작 · 종료 · 상태) */
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
 * 기간만 바꿉니다 (`DEC-075` — 상세 머리말의 「기간 수정」).
 *
 * 🔴 **`update` 를 부를 수 없습니다.** 그쪽은 프로젝트 전체를 다시 쓰는데,
 *    상세 머리말의 그 대화에는 **이름도 설명도 상태도 없습니다** — 없는 값을
 *    기본값으로 채워 보내면 기간 하나 고치려다 설명이 지워집니다. 항목의
 *    부분 갱신(`projectItemPatchSchema`)이 갈라져 있는 것과 같은 근거입니다.
 * ⚠️ 감사 로그는 `PROJECT_UPDATE` 로 같습니다 — 사람에게는 둘 다 「프로젝트를
 *    고쳤다」이고, 로그의 종류를 늘려도 읽는 사람이 갈라 볼 이유가 없습니다.
 */
export async function updateSpan(
  actor: Actor,
  id: string,
  span: { startsOn: string | null; endsOn: string | null }
): Promise<void> {
  const row = await db.project.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!row) throw new AppError("NOT_FOUND", "프로젝트를 찾을 수 없습니다.");

  await db.$transaction(async (tx) => {
    await tx.project.update({
      where: { id },
      data: { startsOn: toDate(span.startsOn), endsOn: toDate(span.endsOn) },
    });
    await audit.log(
      actor,
      {
        action: "PROJECT_UPDATE",
        targetType: "project",
        targetId: id,
        summary: `프로젝트 「${row.name}」 기간 수정`,
      },
      tx
    );
  });
}

/*
 * `assertCanDelete(actor, ownerId)` 가 여기 있었습니다 — 「소유자 또는 `ADMIN`」
 * (`FR-PROJ-004`). **지웠습니다** (`DEC-077`): 사람이 전부 관리자면 뒤쪽 항이 언제나
 * 참이라 식 전체가 참입니다.
 *
 * ⚠️ **댓글을 지우는 짝이 이것과 같았습니다**(`project-item-comment.service`).
 *    거기서 「소유자 + `ADMIN`」을 고른 근거가 *"이 저장소에 이미 있는 짝"* 이었고,
 *    그 짝이 여기였습니다 — **두 곳을 같은 커밋에서 함께** 지웁니다. 한쪽만 고치면
 *    그쪽 머리말이 없는 규칙을 가리킵니다.
 *
 * 삭제가 **남의 일정을 함께 감춘다**는 사실은 그대로입니다. 그것을 막던 것이
 * 권한에서 **휴지통**(`FR-PROJ-004`)으로 옮겨 갔을 뿐입니다 — 되돌릴 수 있습니다.
 */

/** 휴지통으로 (`FR-PROJ-004`) — **지우지 않습니다** */
export async function moveToTrash(actor: Actor, id: string): Promise<void> {
  const row = await db.project.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!row) throw new AppError("NOT_FOUND", "프로젝트를 찾을 수 없습니다.");

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
    select: { id: true, name: true },
  });
  if (!row) throw new AppError("NOT_FOUND", "프로젝트를 찾을 수 없습니다.");

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
 *
 * 🔴 **원본의 「참가자 명단」이 서는 자리입니다.** Orbee 는 이 목록을
 *    `ProjectMember` 에서 뽑고, 그래서 프로젝트마다 다릅니다. 우리에게는 그
 *    표가 없고(`DEC-075`) 승인 회원 전원이 모든 프로젝트를 보므로
 *    (`DEC-018`) **명단이 곧 사내 전원**입니다 — 프로젝트별로 다를 값이
 *    아니라서 `projectId` 를 받지 않습니다.
 * ⚠️ 그래서 담당자 고르개에는 「이 프로젝트에 없는 사람」이라는 갈래가 없습니다.
 *    `avatarUrl` 을 함께 싣는 것은 트리 줄의 얼굴이 그것을 쓰기 때문입니다.
 */
export async function assignableMembers(): Promise<
  { id: string; name: string; username: string; avatarUrl?: string }[]
> {
  const rows = await db.user.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, username: true, avatarUrl: true },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    username: r.username,
    avatarUrl: r.avatarUrl ?? undefined,
  }));
}
