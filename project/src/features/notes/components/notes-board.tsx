"use client";

import { NotebookPen, Plus, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NOTE_BODY_MAX, NOTE_TITLE_MAX } from "@/features/notes/schema";
import type { Note, NoteSummary } from "@/server/services/note.service";
import {
  createNoteAction,
  deleteNoteAction,
  updateNoteAction,
} from "@/server/actions/note.actions";

/**
 * 나의 노트 — **카드 판과 가운데 레이어** (`FR-NOTE-001`~`003`).
 *
 * ## 왜 화면을 옮기지 않는가
 *
 * 메모는 **여러 개를 훑다가 하나를 잠깐 여는** 물건입니다. 그때마다 화면이
 * 통째로 바뀌면 「어디까지 봤는지」를 매번 잃습니다. 그래서 목록 위에
 * 레이어로 띄웁니다 — 닫으면 보던 자리 그대로입니다.
 *
 * ## 그래도 주소에 남깁니다 (`?note=<id>`)
 *
 * 레이어를 상태로만 두면 **뒤로 가기가 목록을 떠납니다.** 주소에 두면
 * 뒤로 가기가 레이어만 닫고, 열어 둔 메모를 새로고침해도 그대로 열립니다.
 *
 * 열 메모는 **서버가 골라서** 넘깁니다(`selected`) — 소유자 판정이 서버에
 * 있어야 하고, 그래야 남의 `id` 를 주소에 넣어도 아무것도 안 열립니다.
 */
export function NotesBoard({
  notes,
  selected,
  missing,
}: {
  notes: NoteSummary[];
  /** `?note=` 가 가리키는 «내» 메모. 없으면 `null` */
  selected: Note | null;
  /** `?note=` 는 있는데 내 것이 아니거나 없는 경우 */
  missing: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();

  /** `true` = 새로 쓰기 레이어가 열려 있다 */
  const [composing, setComposing] = useState(false);
  const open = composing || selected !== null;

  function close() {
    setComposing(false);
    if (params.get("note")) {
      // 주소에서 뺍니다 — 뒤로 가기가 «목록을 떠나지» 않게 `replace` 입니다
      router.replace("/notes");
    }
  }

  return (
    <>
      {/*
        **맨 위의 «메모 작성…»** — 구글 킵과 같은 자리입니다. 새 화면으로
        보내지 않고 같은 레이어를 엽니다.
      */}
      <button
        type="button"
        onClick={() => setComposing(true)}
        className="bg-card hover:bg-muted/60 text-muted-foreground mx-auto flex w-full max-w-xl items-center gap-2 rounded-lg border px-4 py-3 text-left text-sm shadow-sm"
      >
        <Plus className="size-4" />
        메모 작성…
      </button>

      {missing && (
        <p className="text-muted-foreground text-center text-sm">
          그 메모를 찾을 수 없습니다.
        </p>
      )}

      {notes.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-sm">
          <NotebookPen className="size-8" />
          <p>아직 노트가 없습니다</p>
          <p className="text-xs">떠오른 것을 적어 두세요. 팀에는 보이지 않습니다.</p>
        </div>
      ) : (
        /*
          **CSS 다단으로 «벽돌» 배치**를 만듭니다. 카드 높이가 제각각이라
          격자로 두면 짧은 카드 옆에 빈 칸이 남습니다. `break-inside-avoid` 가
          카드가 단 사이에서 잘리는 것을 막습니다 — 라이브러리 없이 됩니다.
        */
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
          {notes.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => router.replace(`/notes?note=${n.id}`)}
              className="bg-card hover:border-foreground/30 mb-4 block w-full break-inside-avoid rounded-lg border p-4 text-left shadow-sm transition-colors"
            >
              <p className="font-medium">{n.title}</p>
              {n.excerpt && (
                <p className="text-muted-foreground mt-1.5 line-clamp-6 text-sm whitespace-pre-wrap">
                  {n.excerpt}
                </p>
              )}
              <p className="text-muted-foreground mt-3 text-xs tabular-nums">
                {n.updatedAt.slice(0, 10)}
              </p>
            </button>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => !v && close()}>
        <DialogContent className="sm:max-w-2xl">
          {/*
            **`key` 로 갈아 끼웁니다.** 다른 메모를 열 때 폼을 이펙트로
            되돌리면 `set-state-in-effect` 에 걸리고(실제로 걸렸습니다),
            타이핑 중에 값이 튀는 형태이기도 합니다. `key` 가 바뀌면 React 가
            새로 마운트하므로 **초기값을 props 로 한 번만** 주면 됩니다.
          */}
          <NoteEditor
            key={selected?.id ?? "new"}
            note={selected}
            onDone={() => {
              setComposing(false);
              router.replace("/notes");
              router.refresh();
            }}
            onClose={close}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * 레이어 안의 편집기.
 *
 * **「보기」와 「수정」을 나누지 않습니다.** 나누면 메모 하나 고치는 데 두 번
 * 눌러야 합니다 — 킵이 그러지 않는 이유이고, 개인 메모는 남이 볼 일이 없어
 * «읽기 전용» 상태가 필요 없습니다.
 */
function NoteEditor({
  note,
  onDone,
  onClose,
}: {
  note: Note | null;
  onDone: () => void;
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  function save() {
    setErrors({});
    start(async () => {
      const input = { title, body };
      const r = note
        ? await updateNoteAction(note.id, input)
        : await createNoteAction(input);
      if (!r.ok) {
        if (r.fieldErrors) setErrors(r.fieldErrors);
        toast.error(r.message ?? "저장하지 못했습니다.");
        return;
      }
      toast.success(note ? "고쳤습니다." : "메모를 만들었습니다.");
      onDone();
    });
  }

  function remove() {
    if (!note) return;
    start(async () => {
      const r = await deleteNoteAction(note.id);
      if (!r.ok) {
        toast.error(r.message ?? "지우지 못했습니다.");
        return;
      }
      toast.success("지웠습니다.");
      onDone();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="sr-only">
          {note ? "노트 보기" : "새 노트"}
        </DialogTitle>
      </DialogHeader>

      {/*
        **테두리는 지우되 여백은 남깁니다.**

        처음에 `px-0` 로 두었더니 글자가 상자 끝에 붙어 「입력칸」으로 안
        보였습니다. 테두리를 없앤 것은 킵처럼 «그냥 글을 쓰는» 느낌을 주려던
        것이고, 그러려면 **여백이 더 필요합니다** — 테두리가 하던 일을
        여백이 대신해야 합니다.

        `focus-visible:ring-0` 도 함께 지웠었는데, 그건 **키보드로 쓰는
        사람에게서 «지금 어디에 있는지»를 뺏는** 것입니다. 테두리가 없으니
        더 그렇습니다. 링은 그대로 둡니다.
      */}
      <Input
        aria-label="제목"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={NOTE_TITLE_MAX}
        placeholder="제목"
        className="h-auto border-0 px-3 py-2.5 text-base font-medium shadow-none"
        autoFocus
      />
      {errors.title?.[0] && (
        <p className="text-destructive text-sm">{errors.title[0]}</p>
      )}

      {/*
        **`rows` 가 안 먹습니다.** `Textarea` 에 `field-sizing-content` 가
        걸려 있어 **내용 높이에 맞춰집니다** — `rows={12}` 를 줘도 세 줄짜리
        메모는 세 줄 높이로 그려졌습니다. 높이를 정하는 것은 `min-h` 입니다.

        위는 `max-h` 로 막습니다. 안 막으면 긴 메모에서 레이어가 화면보다
        길어져 **저장 단추가 화면 밖으로** 나갑니다.
      */}
      <Textarea
        aria-label="내용"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={NOTE_BODY_MAX}
        placeholder="메모를 적으세요."
        className="max-h-[45vh] min-h-72 resize-none overflow-y-auto border-0 px-3 py-2.5 shadow-none"
      />
      {errors.body?.[0] && (
        <p className="text-destructive text-sm">{errors.body[0]}</p>
      )}

      <DialogFooter className="sm:justify-between">
        <div>
          {note && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={pending}
                >
                  <Trash2 className="size-4" />
                  삭제
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    「{note.title}」을 지울까요?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {/* 자료와 달리 휴지통이 없습니다 — 문구를 베껴 오면 거짓말이 됩니다 */}
                    <b>되돌릴 수 없습니다.</b> 메모에는 휴지통이 없어서, 지우면
                    그대로 사라집니다.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={pending}>
                    그만두기
                  </AlertDialogCancel>
                  <AlertDialogAction
                    disabled={pending}
                    onClick={(e) => {
                      e.preventDefault();
                      remove();
                    }}
                  >
                    지웁니다
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs tabular-nums">
            {body.length.toLocaleString()} / {NOTE_BODY_MAX.toLocaleString()}
          </span>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            닫기
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? "저장 중…" : "저장"}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
