import "server-only";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { NoteInput } from "@/features/notes/schema";

/**
 * 개인 메모 (`FR-NOTE-001`~`004`).
 *
 * ## 「나만 보는」이 이 파일의 전부입니다
 *
 * **모든 질의에 `ownerId` 가 들어갑니다.** 「먼저 찾고 나서 소유자를 확인」
 * 하지 않습니다 — 그 형태는 확인을 빠뜨린 한 줄이 곧 남의 메모를 보여 주는
 * 구멍이 되고, 그 한 줄은 리뷰에서 잘 안 보입니다. `where` 에 넣으면
 * **못 찾는 것**이 기본값입니다.
 *
 * ## 관리자도 못 봅니다
 *
 * 이 시스템의 다른 곳은 대개 `EDITOR`·`ADMIN` 에게 더 보여 줍니다
 * (`draftScope`·`archiveForDownload`). 여기는 **아닙니다.** 운영자가
 * 「나만 보는 노트」라고 정했고, 예외를 하나 두면 그건 「나만」이 아닙니다.
 *
 * 그래서 이 파일에는 `Actor` 가 아니라 **`ownerId` 만** 들어옵니다 — 역할을
 * 알면 언젠가 역할로 분기하게 됩니다.
 *
 * ## 감사 로그를 남기지 않습니다
 *
 * 감사 로그는 **팀에 영향을 주는 행위**를 추적합니다(`FR-AUDIT-001`).
 * 개인 메모는 그런 행위가 아니고, 남기면 관리자 화면에 「누가 메모를 몇 개
 * 고쳤는지」가 흐릅니다 — 그건 감시입니다.
 *
 * ## 휴지통이 없습니다
 *
 * 자료는 30일 유예가 있지만(`FR-RES-008`) 메모는 지우면 끝입니다.
 * 그래서 **화면이 지우기 전에 확인을 받습니다.**
 */

export interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface NoteSummary {
  id: string;
  title: string;
  /** 목록에 보여 줄 첫 줄 — 본문 전체를 목록에 싣지 않습니다 */
  excerpt: string;
  updatedAt: string;
}

/** 목록 한 줄에 실어 보낼 본문 길이 */
const EXCERPT = 120;

export async function listFor(ownerId: string): Promise<NoteSummary[]> {
  const rows = await db.note.findMany({
    where: { ownerId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, body: true, updatedAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    excerpt: r.body.replace(/\s+/g, " ").trim().slice(0, EXCERPT),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function get(id: string, ownerId: string): Promise<Note> {
  /*
   * **`findFirst` 에 `ownerId` 를 함께 넣습니다.** `findUnique(id)` 로 찾고
   * 뒤에서 비교하면, 그 비교를 빠뜨린 날 남의 메모가 열립니다.
   *
   * 없는 메모와 남의 메모를 **같은 오류**로 답합니다 — 구별해서 답하면
   * 「그 id 는 존재한다」가 새어 나갑니다.
   */
  const row = await db.note.findFirst({
    where: { id, ownerId },
    select: {
      id: true,
      title: true,
      body: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!row) throw new AppError("NOT_FOUND", "메모를 찾을 수 없습니다.");
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function create(
  ownerId: string,
  input: NoteInput
): Promise<{ id: string }> {
  const row = await db.note.create({
    data: { ownerId, title: input.title, body: input.body },
    select: { id: true },
  });
  return row;
}

/**
 * 고친다. **`updateMany` 로 `ownerId` 를 `where` 에 겁니다.**
 *
 * `update({ where: { id } })` 는 남의 메모도 고칩니다 — 소유자 확인을 코드로
 * 하면 그 사이에 판정과 실행이 갈라집니다. 갱신 «건수»로 판정하면 그 틈이
 * 없습니다 (`job.service.runNow` 가 같은 형태를 씁니다).
 */
export async function update(
  id: string,
  ownerId: string,
  input: NoteInput
): Promise<void> {
  const { count } = await db.note.updateMany({
    where: { id, ownerId },
    data: { title: input.title, body: input.body },
  });
  if (count === 0) throw new AppError("NOT_FOUND", "메모를 찾을 수 없습니다.");
}

/** 지운다 — **되돌릴 수 없습니다.** 휴지통이 없습니다 */
export async function remove(id: string, ownerId: string): Promise<void> {
  const { count } = await db.note.deleteMany({ where: { id, ownerId } });
  if (count === 0) throw new AppError("NOT_FOUND", "메모를 찾을 수 없습니다.");
}

/** 대시보드·마이페이지가 「몇 개인지」만 물을 때 */
export async function countFor(ownerId: string): Promise<number> {
  return db.note.count({ where: { ownerId } });
}

/**
 * 빵부스러기에 쓸 제목. **없으면 `null`** — 던지지 않습니다.
 *
 * 빵부스러기는 화면 전체에 있고, 거기서 던지면 **모든 화면이 죽습니다.**
 * 못 찾은 것은 「주소 조각을 그대로 보여 준다」로 끝나면 됩니다
 * (`breadcrumb-labels` 의 「못 찾으면 아무것도 넣지 않습니다」).
 *
 * `ownerId` 를 여기서도 받습니다 — 이것을 빼면 **본문은 못 봐도 제목은**
 * 남에게 새어 나갑니다.
 */
export async function titleFor(
  id: string,
  ownerId: string
): Promise<string | null> {
  const row = await db.note.findFirst({
    where: { id, ownerId },
    select: { title: true },
  });
  return row?.title ?? null;
}
