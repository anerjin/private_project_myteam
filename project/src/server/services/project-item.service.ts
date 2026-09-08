import "server-only";

import {
  fromDate,
  toDate,
  toGanttColorKey,
  type GanttColorKey,
  type ProjectItemInput,
  type ProjectItemPatch,
} from "@/features/projects/schema";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

/**
 * 프로젝트 항목 (`FR-PROJ-010` ~ `FR-PROJ-015` · `DEC-075`).
 *
 * 옛 `project-task.service` 를 대신합니다. 이름이 「할 일」에서 「항목」으로
 * 바뀐 것은 표 이름을 따라간 것이지만(`project_items`), 그보다 **무엇이 없어졌는지**가
 * 이 파일의 요점입니다.
 *
 * ## ⛔ 없어진 것 — 되살리지 마십시오
 *
 * | 없앤 것 | 그것을 위해 있던 코드 |
 * | --- | --- |
 * | 계층(`parentId`) | 굴러 올라온 기간·진척률(`roll`) · 순환 검사(`assertNoTaskCycle`) · 고아 줍기 |
 * | 마일스톤 | 「한 점」으로 접던 `endsOn = startsOn` 갈래 |
 * | 할 일 상태 | `TaskStatus` enum · 완료 수 세기 · 「끝난 것은 뺀다」 필터 |
 * | 선후행 | `project_task_links` 표 · 고리 검사 · `dependencies` |
 *
 * 옛 파일의 절반이 **굴러 올라온 값을 저장하지 않기 위한 계산**이었습니다.
 * 계층이 없으면 굴러 올라올 것이 없고, 그래서 여기에는 계산이 하나도 없습니다 —
 * 읽어서 그대로 돌려줍니다. 「순환은 코드가 막는다」도 함께 사라졌습니다.
 *
 * ## 조회에 소유자 조건이 없습니다
 *
 * `project.service` 와 같습니다 (`DEC-018`). 원본(Orbee)은 항목 질의마다
 * 프로젝트 접근권을 다시 확인하지만(`requireReadable`) 그것은 사용자별 격리
 * SaaS 의 규율입니다. 우리가 여기서 확인하는 것은 **「이 프로젝트의 항목인가」**
 * 하나이고, 그건 권한이 아니라 **주소를 가로지르지 못하게 하는 것**입니다 —
 * 액션이 항목 id 만 받으므로 그것이 없으면 다른 프로젝트의 일정을 바꿀 수 있습니다.
  *
 * 항목 작성·수정·삭제는 `FR-PROJ-011`(제목 필수 · 시작 · 종료 · 담당자 · 진행률),
 * 목록은 `FR-PROJ-010` 입니다. `DEC-075` 이후 그 화면은 표가 아니라 간트 왼쪽
 * 나무 + 다이얼로그입니다 — 요구사항이 바뀐 것이 아니라 **그리는 자리**가 바뀌었습니다.
 */

export interface ProjectItem {
  id: string;
  title: string;
  /** YYYY-MM-DD 또는 `undefined`(아직 안 정함) */
  startsOn?: string;
  endsOn?: string;
  /** 0~100. **사람이 찍습니다** — 날짜에서 계산하지 않습니다 */
  progress: number;
  /**
   * 간트 막대 색 (`FR-PROJ-014`). 없으면 «안 정함» 입니다.
   *
   * 컬럼이 `String?` 이라 옛 키나 손으로 넣은 값이 남아 있을 수 있어
   * **읽을 때도** `toGanttColorKey` 를 지납니다 — 모르는 값이 그대로 화면까지
   * 가면 CSS 커스텀 속성으로 들어갑니다.
   */
  color?: GanttColorKey;
  assigneeId?: string;
  sortOrder: number;
  /**
   * 이 항목에 달린 댓글 수 (`DEC-074`).
   *
   * **본문은 안 옵니다.** 항목이 수백 건인 프로젝트에서 한 장이 모든 댓글을
   * 지고 오는데 실제로 열어 보는 것은 하나입니다 — 본문은 대화 상자가 열릴 때
   * 서버 액션으로 옵니다.
   */
  commentCount: number;
}

const SELECT = {
  id: true,
  title: true,
  startsOn: true,
  endsOn: true,
  progress: true,
  color: true,
  assigneeId: true,
  sortOrder: true,
} as const;

/**
 * 한 프로젝트의 항목 — **차례대로**.
 *
 * 🔴 **댓글 수를 같은 겹에서 한 번의 질의로** 실어 옵니다. 항목마다 세면
 *    항목 20개에 질의가 20번 늡니다(N+1) — 자료 목록이 북마크 여부를 `IN`
 *    한 번으로 채우는 것과 같은 자리입니다(`resource.service.bookmarkedIds`).
 * ⚠️ 0인 항목은 `groupBy` 결과에 **없습니다**(행이 없는 것은 안 세어집니다).
 *    아래에서 0 으로 채웁니다 — 화면은 «없음»과 «안 왔음»을 가르지 않아도 됩니다.
 */
export async function listFor(projectId: string): Promise<ProjectItem[]> {
  const [rows, counts] = await Promise.all([
    db.projectItem.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: SELECT,
    }),
    db.projectItemComment.groupBy({
      by: ["itemId"],
      where: { deletedAt: null, item: { projectId } },
      _count: { _all: true },
    }),
  ]);

  const commentCount = new Map(counts.map((c) => [c.itemId, c._count._all]));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    startsOn: fromDate(r.startsOn),
    endsOn: fromDate(r.endsOn),
    progress: r.progress,
    color: toGanttColorKey(r.color) ?? undefined,
    assigneeId: r.assigneeId ?? undefined,
    sortOrder: r.sortOrder,
    commentCount: commentCount.get(r.id) ?? 0,
  }));
}

/** 이 항목이 그 프로젝트의 것인가 — 액션이 항목 id 만 받으므로 여기서 봅니다 */
async function belongsTo(itemId: string, projectId: string): Promise<void> {
  const row = await db.projectItem.findFirst({
    where: { id: itemId, projectId },
    select: { id: true },
  });
  if (!row) throw new AppError("NOT_FOUND", "항목을 찾을 수 없습니다.");
}

/**
 * 담당자로 세울 수 있는 사람인가.
 *
 * 🔴 **화면이 목록에서 고르게 한다는 사실에 기대지 않습니다.** 액션은 주소만
 *    알면 부를 수 있으므로, 정지·탈퇴한 계정 id 를 그대로 보낼 수 있습니다 —
 *    그러면 「일을 맡길 수 없는 사람에게 맡겨진 항목」이 남고, 그 줄의 얼굴은
 *    명단에 없어 **빈 칸으로만 보입니다.**
 * ⚠️ 조건은 `project.service.assignableMembers` 의 그것과 같아야 합니다
 *    (`status: "ACTIVE"`) — 갈리면 「고를 수는 있는데 저장이 안 되는 사람」이 생깁니다.
 */
async function assertAssignable(userId: string): Promise<void> {
  const row = await db.user.findFirst({
    where: { id: userId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!row) {
    throw new AppError("INVALID_STATE", "승인된 회원에게만 맡길 수 있습니다.");
  }
}

/**
 * 만듭니다 (`FR-PROJ-010`).
 *
 * 🔴 **id 는 서버가 발급합니다**(`cuid`). 원본(Orbee)은 화면에서
 *    `crypto.randomUUID()` 로 미리 정하는데, 그건 오프라인 우선 저장소라
 *    저장이 끝나기 전에 어디로 갈지 알아야 하기 때문입니다. 우리 전제가
 *    아닙니다 — 그리고 클라이언트가 id 를 정하면 그 값이 곧 **사용자가 보낸
 *    값**이 되어, 남의 id 를 지어내 보내는 길이 열립니다.
 * ⚠️ 그 대신 화면은 낙관적 갱신에 **임시 id** 를 쓰고, 저장이 끝나면 서버가
 *    준 id 로 그 줄을 갈아 끼웁니다(`project-gantt.tsx` 의 `createItem`).
 *
 * 차례는 목록 맨 뒤입니다 — 만든 것이 눈앞에 붙어야 «방금 만든 그것»이 보입니다.
 */
export async function create(
  projectId: string,
  input: ProjectItemInput
): Promise<{ id: string }> {
  if (input.assigneeId) await assertAssignable(input.assigneeId);

  const last = await db.projectItem.aggregate({
    where: { projectId },
    _max: { sortOrder: true },
  });

  return db.projectItem.create({
    data: {
      projectId,
      title: input.title,
      startsOn: toDate(input.startsOn),
      endsOn: toDate(input.endsOn),
      progress: input.progress,
      color: input.color,
      assigneeId: input.assigneeId,
      sortOrder: (last._max.sortOrder ?? -1) + 1,
    },
    select: { id: true },
  });
}

/**
 * 고칩니다 — 🔴 **보낸 칸만** (`FR-PROJ-014` · `FR-PROJ-015`).
 *
 * 간트가 한 항목에 대해 하는 일이 다섯입니다(옮기기·이름·진척률·색·담당자).
 * 옛 파일에는 그중 둘만 따로 함수가 있었고(`reschedule`·`setColor`) 나머지는
 * 항목 전체를 다시 쓰는 `update` 를 지났습니다. 담당자가 늘면서 그 방식은
 * 셋째 전용 함수를 요구했고, 셋이 저마다 검증을 갖게 됩니다.
 *
 * **부분 갱신 하나로 합칩니다.** 「안 보낸 칸」과 「비우겠다」를 값으로 가르는
 * 것은 스키마가 합니다(`projectItemPatchSchema` — `undefined` 대 `null`).
 * 여기서 하는 일은 그 구분을 **Prisma 의 `data` 로 옮기는 것**뿐입니다:
 * 없는 키는 아예 안 넣습니다.
 *
 * ⚠️ **거꾸로 된 기간을 여기서 다시 보지 않습니다.** 한쪽만 보내는 갈래가
 *    흔한데(막대를 끌면 둘 다, 시작만 고치면 하나) 그때 «저장된 반대쪽»과
 *    맞대 보려면 읽기가 하나 더 늡니다. 그리고 이미 거꾸로 저장된 항목을
 *    화면이 **시작일 하루로 접어 그리므로**(`itemSpan`) 그 조합은 화면을
 *    죽이지 않습니다 — 폼과 스키마가 사람이 넣는 길을 막는 것으로 충분합니다.
 */
export async function patch(
  projectId: string,
  id: string,
  input: ProjectItemPatch
): Promise<void> {
  await belongsTo(id, projectId);
  if (input.assigneeId) await assertAssignable(input.assigneeId);

  const data: {
    title?: string;
    startsOn?: Date | null;
    endsOn?: Date | null;
    progress?: number;
    color?: string | null;
    assigneeId?: string | null;
  } = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.startsOn !== undefined) data.startsOn = toDate(input.startsOn);
  if (input.endsOn !== undefined) data.endsOn = toDate(input.endsOn);
  if (input.progress !== undefined) data.progress = input.progress;
  if (input.color !== undefined) data.color = input.color;
  if (input.assigneeId !== undefined) data.assigneeId = input.assigneeId;

  // 빈 패치는 «아무것도 안 바꾼다»입니다 — `updatedAt` 만 올리지 않습니다.
  if (Object.keys(data).length === 0) return;

  await db.projectItem.update({ where: { id }, data });
}

/**
 * 지웁니다 — **댓글도 함께** 사라집니다 (`onDelete: Cascade`).
 *
 * 휴지통을 두지 않았습니다. 항목은 **다시 만드는 값이 싸고**, 되살릴 때
 * 댓글을 어디까지 되살릴지가 곧 규칙 문제가 됩니다. 화면이 먼저
 * 「되돌릴 수 없습니다」를 말합니다.
 *
 * ⚠️ 프로젝트의 휴지통(`FR-PROJ-004`)과 갈리는 자리입니다. 그쪽은 **남의 일을
 *    통째로 감추는** 일이라 되돌릴 길이 필요했고, 여기는 자기 줄 하나입니다.
 */
export async function remove(projectId: string, id: string): Promise<void> {
  await belongsTo(id, projectId);
  await db.projectItem.delete({ where: { id } });
}

/**
 * 내게 맡겨진 항목 (`FR-PROJ-018`) — **프로젝트를 가로질러** 봅니다.
 *
 * 🔴 **원본(Orbee)에는 이 화면이 없습니다.** 그쪽은 프로젝트가 내 것뿐이라
 *    「가로질러 본다」가 «내 프로젝트 전부»와 같은 말이고, 그래서 목록 화면이
 *    그 일을 이미 합니다. 우리는 전원이 모든 프로젝트를 보므로(`DEC-018`)
 *    **「그중 내 몫」을 골라 주는 자리가 따로 필요합니다** — 프로젝트가 스무
 *    개면 내게 맡겨진 것을 찾으려고 스무 번 들어가야 합니다. 그래서 화면을
 *    통째로 바꾸면서도 이 하나는 남겼고, 대신 없어진 칸(상태)을 안 씁니다.
 *
 * 마감이 가까운 것부터. 날짜가 없는 것은 뒤로 갑니다 (`nulls: "last"`) —
 * 안 그러면 아직 계획도 안 선 일이 맨 위를 차지합니다.
 *
 * ⚠️ **「끝난 것을 뺀다」가 없어졌습니다.** 그 필터는 `status !== "DONE"` 이었고
 *    상태 칸이 사라졌습니다. 대신 **진척률 100% 를 뺍니다** — 사람이 찍는
 *    값이라 뜻이 같고, 화면에 이미 있는 값입니다.
 */
export async function assignedTo(
  userId: string,
  take = 50
): Promise<
  {
    id: string;
    title: string;
    endsOn?: string;
    progress: number;
    project: { name: string; slug: string };
  }[]
> {
  const rows = await db.projectItem.findMany({
    where: {
      assigneeId: userId,
      progress: { lt: 100 },
      project: { deletedAt: null },
    },
    orderBy: [{ endsOn: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take,
    select: {
      id: true,
      title: true,
      endsOn: true,
      progress: true,
      project: { select: { name: true, slug: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    endsOn: fromDate(r.endsOn),
    progress: r.progress,
    project: r.project,
  }));
}
