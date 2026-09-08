import "server-only";

import type { ProjectItemCommentInput } from "@/features/projects/schema";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/server/auth/actor";
import * as audit from "@/server/services/audit.service";

/**
 * 항목 댓글 (`DEC-074` — gboard 의 `ProjectItemComment` 을 우리 모델로 옮긴 것).
 *
 * 🔄 **`DEC-075` 에서 이름만 바뀌었습니다** — 옛 `project-task-comment.service`
 *    입니다. 붙는 대상이 「할 일」에서 「항목」이 된 것은 표를 따라간 것이고,
 *    **아래 판정은 하나도 안 바꿨습니다.** 화면을 통째로 갈아엎으면서 권한 규칙이
 *    조용히 함께 바뀌는 것이 이 종류의 작업에서 가장 흔한 사고입니다.
 *
 * ## 가져오면서 «빼고 온» 것
 *
 * 원본은 SaaS 라 **소유자별로 격리하고 본문을 암호화**합니다. 우리는 사내
 * 전용이고 승인된 회원 전원이 모든 자료를 봅니다 (`DEC-018`) — 그래서 조회에
 * `userId` 조건이 없고 본문도 평문입니다. 원본에는 프로젝트 «참가자»가 있어
 * 「참가자만 읽고 쓴다」가 성립했지만, **우리에게는 멤버십이 없습니다.**
 * 읽고 쓰는 판정에 멤버십을 흉내 내면 없는 개념을 하나 만드는 것이 됩니다.
 *
 * ## 누가 지우고 누가 고치는가 — **둘이 여전히 다릅니다** (`DEC-077`)
 *
 * | | 할 수 있는 사람 | 왜 |
 * | --- | --- | --- |
 * | 쓰기 | 로그인한 사람 전원 | `DEC-018` |
 * | 고치기 | **작성자 본인만** | 남의 말을 그 사람 이름 아래에서 바꾸는 것은 조정이 아니라 **위조**입니다 |
 * | 지우기 | 로그인한 사람 전원 | 아래 |
 *
 * 🔄 **지우기는 「작성자 · 프로젝트를 만든 사람 · `ADMIN`」이었습니다.**
 *    `DEC-077` 로 사람이 전부 관리자가 되면서 세 번째 항이 언제나 참이 되어
 *    식 전체가 참이 됐고, `canDelete`/`assertCanDelete` 를 지웠습니다.
 *    그 짝(`소유자 + ADMIN`)을 빌려 온 원래 자리인 `project.service.assertCanDelete`
 *    도 **같은 커밋에서 함께** 사라졌습니다 — 한쪽만 남기면 이 머리말이 없는
 *    규칙을 가리킵니다.
 *
 * ⚠️ 전에 이 자리에는 *"`EDITOR` 를 일부러 뺐다 — 넣으면 사실상 「아무나 남의
 *    댓글을 지운다」가 된다"* 고 적혀 있었습니다. **그 우려가 현실이 된 것처럼
 *    보이지만 아닙니다.** 그 문장이 겨눈 것은 「20명 팀에서 흔한 등급」이었고,
 *    지금 이 시스템을 쓰는 사람은 **한 명**입니다 — 「아무나」에 해당하는 남이
 *    없습니다. 사람이 다시 여럿이 되는 날, 되살릴 것은 `EDITOR` 가 아니라
 *    **「작성자 · 프로젝트를 만든 사람」** 두 항입니다(그 둘은 등급이 아니라
 *    소유권이라 등급 없이도 성립합니다).
 *
 * **고치기는 안 건드렸습니다.** 그것은 등급 규칙이 아니라 「본인인가」였고,
 * `ADMIN` 에게도 열려 있던 적이 없습니다 — 등급이 사라져도 그대로입니다.
 *
 * ## 감사 로그를 남깁니다 — 항목과 **반대**입니다
 *
 * `features/audit/actions` 는 「그릇만 기록하고 안의 글은 기록하지 않는다」로
 * 서 있습니다. 댓글은 그 규칙을 **지우지 않고 좁힌 예외**입니다:
 *
 * - 항목은 고쳐도 그 줄이 화면에 그대로 있습니다. 누가 옮겼는지가 궁금한 값이
 *   아니라 **지금 언제인지**가 궁금한 값입니다.
 * - 댓글은 **남이 지울 수 있고**, 지우면 어느 화면도 그것을 다시 읽지
 *   않습니다(soft delete 라 행은 남지만 목록 질의가 `deletedAt: null` 입니다).
 *   그 순간 「내가 쓴 줄이 없어졌다」에 답할 자리가 감사 로그밖에 없습니다.
 *
 * 그래서 **쓴 것도 지운 것도 남깁니다** — 지운 기록만 남기면 「무엇이
 * 지워졌는가」의 짝이 없습니다.
 *
 * ⚠️ **본문은 로그에 넣지 않습니다.** 요약과 `diff` 에 글을 실으면 감사 로그가
 * 「남의 댓글을 모아 읽는 화면」이 됩니다 — 개인 메모를 기록하지 않는 것과 같은
 * 선입니다. 지워진 본문이 필요하면 `project_item_comments` 의 행이 그대로
 * 있습니다(그것이 soft delete 를 고른 이유이기도 합니다).
 *
 * ## 세는 일은 여기 없습니다
 *
 * 🔄 옛 `countsFor` 를 `project-item.service.listFor` 로 옮겼습니다 (`DEC-075`).
 *    화면이 항목 목록과 댓글 수를 **언제나 함께** 쓰는데(트리 줄의 배지) 두
 *    service 를 각각 부르면 페이지가 그 둘을 맞춰 끼우는 일을 하게 되고,
 *    한쪽만 다시 읽는 날 수와 줄이 어긋납니다.
 */

export interface ItemComment {
  id: string;
  body: string;
  author: { id: string; name: string };
  /** ISO 문자열. 화면이 사람의 시간대로 그립니다 */
  createdAt: string;
  /** 고친 적이 있는가 — 화면이 「(고침)」을 붙일지 정합니다 */
  edited: boolean;
  /**
   * 내가 쓴 것인가 — **고치기 단추는 이것만 봅니다.**
   *
   * ⚠️ **관문이 아닙니다.** 실제로 막는 것은 아래 `assertCanEdit` 입니다.
   * 화면의 값은 「무엇을 그릴까」이고, 액션은 그것을 안 믿습니다.
   */
  mine: boolean;
}

const ROW = {
  id: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  authorId: true,
  author: { select: { id: true, name: true } },
} as const;

/**
 * 고친 적이 있는가 — **컬럼이 아니라 두 시각의 차이로 봅니다.**
 *
 * `updatedAt` 은 `@updatedAt` 이라 **만들 때도 채워집니다.** 두 값이 같은
 * 순간을 가리키므로 `!==` 로 보면 방금 쓴 댓글이 전부 「고침」이 됩니다.
 * 그래서 경계가 필요한데, 그 경계를 «넉넉히» 잡는 것으로 때우지 않았습니다 —
 * 넉넉한 경계는 그만큼의 **진짜 수정을 숨깁니다.**
 *
 * 대신 아래 `create` 가 `createdAt` 을 **손으로 넣습니다.** 두 시각이 같은
 * 시계(Node)에서 나오게 하려는 것입니다 — 안 그러면 `created_at` 은 DB 의
 * `CURRENT_TIMESTAMP`, `updated_at` 은 Prisma 클라이언트의 `new Date()` 라
 * **서로 다른 시계 둘**을 빼게 되고, DB 가 몇 초 뒤처진 날에는 **모든 새
 * 댓글에 「(고침)」이 붙습니다.**
 *
 * 한 시계에서 나오므로 남는 오차는 같은 호출 안의 몇 밀리초뿐이고, `500ms`
 * 면 충분합니다. 이 값이 숨기는 것은 **쓰자마자 0.5초 안에 고친 경우**인데
 * 그건 사람이 이 화면으로 할 수 있는 일이 아닙니다.
 *
 * > 이것이 거슬리면 정직한 해법은 `edited_at` 컬럼 하나입니다. 지금은 표를
 * > 하나 더 고칠 값이 없어서 안 넣었습니다.
 */
function wasEdited(createdAt: Date, updatedAt: Date): boolean {
  return updatedAt.getTime() - createdAt.getTime() > 500;
}

/**
 * 고칠 수 있는가 — **본인만**.
 *
 * 지우는 것은 「이 말을 여기 두지 않는다」이고, 고치는 것은 「이 사람이 이렇게
 * 말했다」를 바꾸는 것이라 성질이 다릅니다. 그래서 지우기가 전원에게 열린 지금도
 * (`DEC-077`) 이 문은 **닫혀 있습니다** — 이건 등급 규칙이었던 적이 없습니다.
 */
function assertCanEdit(actor: Actor, authorId: string): void {
  if (actor.id === authorId) return;
  throw new AppError("FORBIDDEN", "남의 댓글은 고칠 수 없습니다.");
}

/**
 * 이 항목이 그 프로젝트의 것인가.
 *
 * 액션이 `itemId` 만 받으므로 여기서 봅니다(`project-item.service` 의
 * `belongsTo` 와 같은 이유). **주소의 프로젝트와 항목이 어긋나면 못 찾습니다.**
 *
 * 🔄 프로젝트 소유자를 같은 질의에서 함께 읽었습니다 — 지우기 권한이 그 값을
 *    썼기 때문입니다. `DEC-077` 로 그 판정이 사라져 **`title` 만 남습니다.**
 */
async function itemInProject(
  itemId: string,
  projectId: string
): Promise<{ title: string }> {
  const row = await db.projectItem.findFirst({
    where: { id: itemId, projectId },
    select: { title: true },
  });
  if (!row) throw new AppError("NOT_FOUND", "항목을 찾을 수 없습니다.");
  return { title: row.title };
}

/**
 * 댓글 한 줄을 찾습니다 — **프로젝트를 가로지르지 못하게** 조건을 걸고서.
 *
 * 액션이 댓글 id 만 받습니다. `where` 에 `item: { projectId }` 가 없으면 남의
 * 프로젝트에 있는 댓글 id 를 보내 지울 수 있습니다.
 */
async function commentInProject(id: string, projectId: string) {
  const row = await db.projectItemComment.findFirst({
    where: { id, deletedAt: null, item: { projectId } },
    select: {
      id: true,
      authorId: true,
      author: { select: { username: true } },
      item: { select: { id: true, title: true } },
    },
  });
  if (!row) throw new AppError("NOT_FOUND", "댓글을 찾을 수 없습니다.");
  return row;
}

/**
 * 한 항목의 댓글 — **오래된 것부터**.
 *
 * 기록이라서 그렇습니다. 최신이 위인 목록은 「읽는 순서」가 대화의 순서와
 * 반대가 되고, 답이 물음보다 위에 놓입니다.
 */
export async function listFor(
  actor: Actor,
  projectId: string,
  itemId: string
): Promise<ItemComment[]> {
  /*
   * **항목이 그 프로젝트의 것인지 먼저 확인합니다.** 반환값을 쓰지 않아도
   * 부릅니다 — 남의 프로젝트 주소에 남의 항목 id 를 붙여 댓글을 읽는 길을
   * 막는 것이 이 호출의 일입니다(`itemInProject` 머리말).
   */
  await itemInProject(itemId, projectId);

  const rows = await db.projectItemComment.findMany({
    where: { itemId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: ROW,
  });

  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    author: r.author,
    createdAt: r.createdAt.toISOString(),
    edited: wasEdited(r.createdAt, r.updatedAt),
    mine: r.authorId === actor.id,
  }));
}

export async function create(
  actor: Actor,
  projectId: string,
  itemId: string,
  input: ProjectItemCommentInput
): Promise<{ id: string }> {
  const item = await itemInProject(itemId, projectId);

  return db.$transaction(async (tx) => {
    const made = await tx.projectItemComment.create({
      /*
       * **`createdAt` 을 손으로 넣습니다** — 컬럼에 `DEFAULT CURRENT_TIMESTAMP`
       * 가 있는데도요. 이유는 `wasEdited` 에 적었습니다: 「고침」 표시가 DB 와
       * Node **두 시계의 차이**로 흔들리지 않게 하려는 것입니다.
       */
      data: {
        itemId,
        authorId: actor.id,
        body: input.body,
        createdAt: new Date(),
      },
      select: { id: true },
    });
    await audit.log(
      actor,
      {
        action: "PROJECT_COMMENT_CREATE",
        targetType: "project_item_comment",
        targetId: made.id,
        // 본문은 넣지 않습니다 — 파일 머리말의 이유
        summary: `항목 「${item.title}」에 댓글을 남겼습니다`,
      },
      tx
    );
    return made;
  });
}

/** 고칩니다 — **본인만** (`assertCanEdit`) */
export async function update(
  actor: Actor,
  projectId: string,
  id: string,
  input: ProjectItemCommentInput
): Promise<void> {
  const row = await commentInProject(id, projectId);
  assertCanEdit(actor, row.authorId);

  await db.$transaction(async (tx) => {
    await tx.projectItemComment.update({
      where: { id },
      data: { body: input.body },
    });
    await audit.log(
      actor,
      {
        action: "PROJECT_COMMENT_UPDATE",
        targetType: "project_item_comment",
        targetId: id,
        summary: `항목 「${row.item.title}」의 댓글을 고쳤습니다`,
      },
      tx
    );
  });
}

/**
 * 지웁니다 — **soft delete** 입니다.
 *
 * 옆 표들과 같은 규칙이라야 「지운 것」의 뜻이 표마다 갈라지지 않습니다
 * (`projects`). 그리고 남이 지울 수 있는 값이라, 행이 남아 있는 것 자체가
 * 「무엇이 지워졌는가」의 답입니다 — 감사 로그가 본문을 안 싣는 것(파일
 * 머리말)이 여기에 기대고 있습니다.
 *
 * **되살리는 화면은 없습니다.** 항목 자체에 휴지통이 없는데
 * (`project-item.service.remove`) 그 안의 댓글만 되살릴 자리를 만들면
 * 「무엇을 되살릴 수 있는가」가 표마다 달라집니다.
 */
export async function remove(
  actor: Actor,
  projectId: string,
  id: string
): Promise<void> {
  const row = await commentInProject(id, projectId);

  const mine = row.authorId === actor.id;

  await db.$transaction(async (tx) => {
    /*
     * `update` 가 아니라 조건을 건 `updateMany` 입니다. 위에서 `deletedAt: null`
     * 을 확인했지만 그 사이 다른 사람이 지웠을 수 있고, 그때 두 번째 삭제가
     * `deletedAt` 을 **뒤 시각으로 덮어씁니다** — 「언제 지워졌는가」가 틀립니다.
     */
    const { count } = await tx.projectItemComment.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (count === 0)
      throw new AppError("NOT_FOUND", "댓글을 찾을 수 없습니다.");

    await audit.log(
      actor,
      {
        action: "PROJECT_COMMENT_DELETE",
        targetType: "project_item_comment",
        targetId: id,
        /*
         * **남의 것을 지웠으면 그 사실이 한 줄에 보여야 합니다.** 감사 목록은
         * 요약만 보고 넘어가는 화면이라(`audit.service` 주석), 「누구의 댓글을
         * 지웠는가」가 여기 없으면 조정 행위가 자기 댓글 정리와 구별되지 않습니다.
         */
        summary: mine
          ? `항목 「${row.item.title}」에 쓴 내 댓글을 지웠습니다`
          : `항목 「${row.item.title}」의 댓글을 지웠습니다 — 쓴 사람 @${row.author.username}`,
      },
      tx
    );
  });
}
