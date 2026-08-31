import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/common/page-header";
import { NotesBoard } from "@/features/notes/components/notes-board";
import { AppError } from "@/lib/errors";
import { requireActiveUser } from "@/server/auth/guards";
import * as noteService from "@/server/services/note.service";

export const metadata: Metadata = { title: "나의 노트" };

/**
 * SCR-134 나의 노트 (`FR-NOTE-001`).
 *
 * **나만 봅니다.** 목록도 「열 메모」도 질의에 `ownerId` 가 들어가고,
 * 관리자도 예외가 없습니다 (`note.service` 머리 주석).
 *
 * ## 여는 것은 서버가 고릅니다
 *
 * 레이어는 `?note=<id>` 로 엽니다. 그 `id` 를 **서버가 내 것인지 보고**
 * 골라서 넘깁니다 — 화면이 목록에서 찾아 쓰게 두면, 목록에 없는 남의 `id` 를
 * 주소에 넣었을 때 무슨 일이 일어나는지가 화면 코드에 달립니다.
 */
export default async function NotesPage({
  searchParams,
}: PageProps<"/notes">) {
  // 인가는 레이아웃이 아니라 page 가 한다 (`DEC-035`)
  const session = await requireActiveUser();
  const { note: noteId } = await searchParams;
  const wanted = typeof noteId === "string" ? noteId : undefined;

  const notes = await noteService.listFor(session.userId);

  /*
   * 없는 `id` 와 남의 `id` 를 **같이** 다룹니다 — 구별해서 답하면 그 `id` 가
   * 존재한다는 사실이 새어 나갑니다 (`note.service.get` 과 같은 규칙).
   */
  let selected = null;
  let missing = false;
  if (wanted) {
    try {
      selected = await noteService.get(wanted, session.userId);
    } catch (e) {
      if (e instanceof AppError && e.code === "NOT_FOUND") missing = true;
      else throw e;
    }
  }

  return (
    <>
      <PageHeader
        title="나의 노트"
        description="나만 보는 메모입니다. 팀에는 보이지 않고 검색에도 안 나옵니다."
        count={notes.length}
      />
      {/* `useSearchParams` 를 쓰므로 경계가 필요합니다 */}
      <Suspense fallback={null}>
        <NotesBoard notes={notes} selected={selected} missing={missing} />
      </Suspense>
    </>
  );
}
