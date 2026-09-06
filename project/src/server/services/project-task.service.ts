import "server-only";

import {
  fromDate,
  toDate,
  type ProjectTaskInput,
} from "@/features/projects/schema";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

/**
 * 할 일 · 일정 (`FR-PROJ-010`~`018` · `DEC-069`).
 *
 * ## 굴러 올라온 값은 «저장하지 않습니다»
 *
 * 부모의 기간과 진행률은 자식에서 계산합니다. 컬럼으로 두면 자식을 옮길 때마다
 * 부모를 다시 써야 하고, 그 갱신을 **한 번 빠뜨리면 화면이 조용히
 * 거짓말합니다** — 되돌릴 방법도 없이 「부모는 3월까지인데 자식은 5월」이
 * 남습니다. 읽을 때 계산하면 틀릴 자리가 없습니다.
 *
 * 한 프로젝트의 할 일을 **통째로 읽어 메모리에서** 계산합니다. 재귀 SQL 로
 * 할 수도 있지만, 이 규모(프로젝트 하나에 수십~수백 건)에서 그 복잡도는
 * 값이 없습니다.
 *
 * ## 순환은 코드가 막습니다
 *
 * 「A→B→A」는 외래키에 안 걸립니다 (`DEC-069`). 부모–자식과 선후행 둘 다
 * 여기서 검사합니다 — 안 하면 아래 롤업이 무한히 돕니다.
 */

export interface Task {
  id: string;
  title: string;
  parentId?: string;
  /** 사람이 «적어 둔» 날짜. 부모는 비어 있을 수 있습니다 */
  startsOn?: string;
  endsOn?: string;
  /** 자식까지 감안한 날짜 — **화면과 간트가 쓰는 값** */
  effectiveStart?: string;
  effectiveEnd?: string;
  isMilestone: boolean;
  /** 적어 둔 진행률. 자식이 있으면 `effectiveProgress` 가 이깁니다 */
  progress: number;
  effectiveProgress: number;
  status: string;
  assignee?: { id: string; name: string };
  sortOrder: number;
  hasChildren: boolean;
  /** 트리 깊이 — 표에서 들여쓰기에 씁니다 */
  depth: number;
}

export interface TaskLink {
  id: string;
  fromTaskId: string;
  toTaskId: string;
}

const SELECT = {
  id: true,
  title: true,
  parentId: true,
  startsOn: true,
  endsOn: true,
  isMilestone: true,
  progress: true,
  status: true,
  sortOrder: true,
  assignee: { select: { id: true, name: true } },
} as const;

/**
 * 목록 (`FR-PROJ-010`) — **트리 순서로 펴서** 돌려줍니다.
 *
 * 표도 간트도 「부모 바로 아래 자식」 순서를 기대합니다. 정렬을 화면에 맡기면
 * 표와 간트가 서로 다른 순서를 그리게 됩니다.
 */
export async function listFor(projectId: string): Promise<Task[]> {
  const rows = await db.projectTask.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: SELECT,
  });

  const childrenOf = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.parentId ?? "";
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(r);
  }

  /**
   * 자식까지 감안한 값.
   *
   * **자식이 없으면 자기 값이 그대로**입니다. 자식이 있으면 기간은 자식의
   * 최소~최대이고 진행률은 자식의 평균입니다 — 가중치를 주려면 기간이
   * 필요한데, 날짜가 비어 있는 자식이 흔해서 그 평균이 더 자주 거짓말합니다.
   */
  const rolled = new Map<
    string,
    { start?: Date; end?: Date; progress: number }
  >();

  function roll(id: string, seen: Set<string>): {
    start?: Date;
    end?: Date;
    progress: number;
  } {
    const cached = rolled.get(id);
    if (cached) return cached;

    const row = rows.find((r) => r.id === id)!;
    const kids = childrenOf.get(id) ?? [];
    /*
     * **순환이 있으면 여기서 멈춥니다.** 만들 때 막고 있지만(`assertNoTaskCycle`),
     * 손으로 넣은 데이터나 옛 행이 순환일 수 있습니다 — 그때 화면이 뜨지
     * 않는 것보다 «자기 값만» 보여 주는 편이 낫습니다.
     */
    if (kids.length === 0 || seen.has(id)) {
      const own = {
        start: row.startsOn ?? undefined,
        end: row.endsOn ?? undefined,
        progress: row.progress,
      };
      rolled.set(id, own);
      return own;
    }

    seen.add(id);
    const parts = kids.map((k) => roll(k.id, seen));
    seen.delete(id);

    const starts = parts.map((p) => p.start).filter((d): d is Date => !!d);
    const ends = parts.map((p) => p.end).filter((d): d is Date => !!d);
    const out = {
      start: starts.length
        ? new Date(Math.min(...starts.map((d) => d.getTime())))
        : (row.startsOn ?? undefined),
      end: ends.length
        ? new Date(Math.max(...ends.map((d) => d.getTime())))
        : (row.endsOn ?? undefined),
      progress: Math.round(
        parts.reduce((sum, p) => sum + p.progress, 0) / parts.length
      ),
    };
    rolled.set(id, out);
    return out;
  }

  const out: Task[] = [];
  function walk(parentKey: string, depth: number) {
    for (const r of childrenOf.get(parentKey) ?? []) {
      const kids = childrenOf.get(r.id) ?? [];
      const eff = roll(r.id, new Set());
      out.push({
        id: r.id,
        title: r.title,
        parentId: r.parentId ?? undefined,
        startsOn: fromDate(r.startsOn),
        endsOn: fromDate(r.endsOn),
        effectiveStart: fromDate(eff.start),
        effectiveEnd: fromDate(eff.end),
        isMilestone: r.isMilestone,
        progress: r.progress,
        effectiveProgress: eff.progress,
        status: r.status,
        assignee: r.assignee ?? undefined,
        sortOrder: r.sortOrder,
        hasChildren: kids.length > 0,
        depth,
      });
      walk(r.id, depth + 1);
    }
  }
  walk("", 0);

  /*
   * **고아를 버리지 않습니다.** 부모가 순환이거나 이상해서 위 순회에 안 잡힌
   * 행이 있으면 목록 끝에 붙입니다 — 안 그러면 할 일이 «있는데 안 보입니다».
   */
  const shown = new Set(out.map((t) => t.id));
  for (const r of rows) {
    if (shown.has(r.id)) continue;
    const eff = roll(r.id, new Set());
    out.push({
      id: r.id,
      title: r.title,
      parentId: r.parentId ?? undefined,
      startsOn: fromDate(r.startsOn),
      endsOn: fromDate(r.endsOn),
      effectiveStart: fromDate(eff.start),
      effectiveEnd: fromDate(eff.end),
      isMilestone: r.isMilestone,
      progress: r.progress,
      effectiveProgress: eff.progress,
      status: r.status,
      assignee: r.assignee ?? undefined,
      sortOrder: r.sortOrder,
      hasChildren: false,
      depth: 0,
    });
  }

  return out;
}

export async function listLinks(projectId: string): Promise<TaskLink[]> {
  const rows = await db.projectTaskLink.findMany({
    where: { from: { projectId } },
    select: { id: true, fromTaskId: true, toTaskId: true },
  });
  return rows;
}

/** 이 할 일이 그 프로젝트의 것인가 — 액션이 id 만 받으므로 여기서 봅니다 */
async function belongsTo(taskId: string, projectId: string): Promise<void> {
  const row = await db.projectTask.findFirst({
    where: { id: taskId, projectId },
    select: { id: true },
  });
  if (!row) throw new AppError("NOT_FOUND", "할 일을 찾을 수 없습니다.");
}

/**
 * 부모–자식 순환을 막는다.
 *
 * 새 부모의 조상을 거슬러 올라가다 **자기 자신을 만나면** 순환입니다.
 * 안 막으면 위 롤업이 무한히 돕니다.
 */
async function assertNoTaskCycle(
  taskId: string,
  parentId: string
): Promise<void> {
  if (taskId === parentId) {
    throw new AppError("INVALID_STATE", "자기 자신을 상위로 둘 수 없습니다.");
  }
  let cursor: string | null = parentId;
  for (let i = 0; i < 100 && cursor; i += 1) {
    if (cursor === taskId) {
      throw new AppError(
        "INVALID_STATE",
        "상위·하위가 서로를 가리키게 됩니다."
      );
    }
    const row: { parentId: string | null } | null =
      await db.projectTask.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
    cursor = row?.parentId ?? null;
  }
}

export async function create(
  projectId: string,
  input: ProjectTaskInput
): Promise<{ id: string }> {
  if (input.parentId) await belongsTo(input.parentId, projectId);

  const last = await db.projectTask.aggregate({
    where: { projectId },
    _max: { sortOrder: true },
  });

  return db.projectTask.create({
    data: {
      projectId,
      parentId: input.parentId ?? null,
      title: input.title,
      startsOn: toDate(input.startsOn),
      /** 마일스톤은 한 점 — 종료일을 시작일로 맞춥니다 (`FR-PROJ-017`) */
      endsOn: input.isMilestone
        ? toDate(input.startsOn)
        : toDate(input.endsOn),
      isMilestone: input.isMilestone,
      progress: input.progress,
      status: input.status,
      assigneeId: input.assigneeId ?? null,
      sortOrder: (last._max.sortOrder ?? -1) + 1,
    },
    select: { id: true },
  });
}

export async function update(
  projectId: string,
  id: string,
  input: ProjectTaskInput
): Promise<void> {
  await belongsTo(id, projectId);
  if (input.parentId) {
    await belongsTo(input.parentId, projectId);
    await assertNoTaskCycle(id, input.parentId);
  }

  await db.projectTask.update({
    where: { id },
    data: {
      parentId: input.parentId ?? null,
      title: input.title,
      startsOn: toDate(input.startsOn),
      endsOn: input.isMilestone ? toDate(input.startsOn) : toDate(input.endsOn),
      isMilestone: input.isMilestone,
      progress: input.progress,
      status: input.status,
      assigneeId: input.assigneeId ?? null,
    },
  });
}

/**
 * 날짜만 바꾼다 (`FR-PROJ-015`).
 *
 * **간트에서 막대를 끌 때도, 폼에 날짜를 적을 때도 여기로 옵니다.** 두 길이
 * 갈리면 한쪽에만 검증이 붙고, 대개 «끄는 쪽»이 빠집니다.
 */
export async function reschedule(
  projectId: string,
  id: string,
  startsOn: string | undefined,
  endsOn: string | undefined
): Promise<void> {
  await belongsTo(id, projectId);
  if (startsOn && endsOn && startsOn > endsOn) {
    throw new AppError("VALIDATION_ERROR", "종료일이 시작일보다 앞섭니다.");
  }
  const row = await db.projectTask.findUnique({
    where: { id },
    select: { isMilestone: true },
  });
  await db.projectTask.update({
    where: { id },
    data: {
      startsOn: toDate(startsOn),
      endsOn: row?.isMilestone ? toDate(startsOn) : toDate(endsOn),
    },
  });
}

/**
 * 지운다 — **자식도 함께** 사라집니다 (`onDelete: Cascade`).
 *
 * 휴지통을 두지 않았습니다. 할 일은 문서와 달리 **다시 만드는 값이 싸고**,
 * 되살릴 때 자식·의존을 어디까지 되살릴지가 곧 규칙 문제가 됩니다.
 * 화면이 「하위 N건도 함께 사라집니다」를 먼저 말합니다.
 */
export async function remove(projectId: string, id: string): Promise<void> {
  await belongsTo(id, projectId);
  await db.projectTask.delete({ where: { id } });
}

/** 순서 바꾸기 — 문서와 같은 규칙(받은 배열이 정본) */
export async function reorder(
  projectId: string,
  orderedIds: string[]
): Promise<void> {
  const rows = await db.projectTask.findMany({
    where: { projectId },
    select: { id: true },
  });
  const known = new Set(rows.map((r) => r.id));
  const ids = orderedIds.filter((id) => known.has(id));
  await db.$transaction(
    ids.map((id, i) =>
      db.projectTask.update({ where: { id }, data: { sortOrder: i } })
    )
  );
}

/**
 * 선후행을 잇는다 (`FR-PROJ-016`).
 *
 * **순환을 여기서 막습니다.** `to` 에서 출발해 따라가다 `from` 을 만나면
 * 그 선을 더하는 순간 고리가 됩니다 — DB 는 못 막습니다 (`DEC-069`).
 */
export async function link(
  projectId: string,
  fromTaskId: string,
  toTaskId: string
): Promise<void> {
  if (fromTaskId === toTaskId) {
    throw new AppError("INVALID_STATE", "자기 자신과 이을 수 없습니다.");
  }
  await belongsTo(fromTaskId, projectId);
  await belongsTo(toTaskId, projectId);

  const links = await db.projectTaskLink.findMany({
    where: { from: { projectId } },
    select: { fromTaskId: true, toTaskId: true },
  });
  const next = new Map<string, string[]>();
  for (const l of links) {
    if (!next.has(l.fromTaskId)) next.set(l.fromTaskId, []);
    next.get(l.fromTaskId)!.push(l.toTaskId);
  }

  const stack = [toTaskId];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === fromTaskId) {
      throw new AppError(
        "INVALID_STATE",
        "선후행이 고리를 이룹니다 — 이미 반대 방향으로 이어져 있습니다."
      );
    }
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(next.get(cur) ?? []));
  }

  await db.projectTaskLink.create({ data: { fromTaskId, toTaskId } });
}

export async function unlink(projectId: string, id: string): Promise<void> {
  const row = await db.projectTaskLink.findFirst({
    where: { id, from: { projectId } },
    select: { id: true },
  });
  if (!row) throw new AppError("NOT_FOUND", "이어진 것을 찾을 수 없습니다.");
  await db.projectTaskLink.delete({ where: { id } });
}

/**
 * 내게 배정된 할 일 (`FR-PROJ-018`) — **프로젝트를 가로질러** 봅니다.
 *
 * 끝난 것은 빼고, 마감이 가까운 것부터. 날짜가 없는 것은 뒤로 갑니다
 * (`nulls: "last"`) — 안 그러면 아직 계획도 안 선 일이 맨 위를 차지합니다.
 */
export async function assignedTo(
  userId: string,
  take = 10
): Promise<
  {
    id: string;
    title: string;
    endsOn?: string;
    status: string;
    project: { name: string; slug: string };
  }[]
> {
  const rows = await db.projectTask.findMany({
    where: {
      assigneeId: userId,
      status: { notIn: ["DONE"] },
      project: { deletedAt: null },
    },
    orderBy: [{ endsOn: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take,
    select: {
      id: true,
      title: true,
      endsOn: true,
      status: true,
      project: { select: { name: true, slug: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    endsOn: fromDate(r.endsOn),
    status: r.status,
    project: r.project,
  }));
}
