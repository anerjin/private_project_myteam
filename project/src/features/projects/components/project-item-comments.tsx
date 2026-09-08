"use client";

import { Check, Loader2, MessageSquare, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  PersonAvatar,
  displayName,
} from "@/features/projects/components/project-person";
import { ITEM_COMMENT_MAX } from "@/features/projects/schema";
import { cn } from "@/lib/utils";
import {
  addItemCommentAction,
  deleteItemCommentAction,
  listItemCommentsAction,
  updateItemCommentAction,
} from "@/server/actions/project.actions";
import type { ItemComment } from "@/server/services/project-item-comment.service";

/**
 * 항목 댓글 (`DEC-074` — gboard 에서 가져온 기능 · `DEC-075` 에서 자리를 옮김).
 *
 * ## 🔄 자리가 **표의 동작 칸에서 간트 트리의 이름칸으로** 옮겨 갔습니다
 *
 * `DEC-074` 때 이 컴포넌트는 표의 동작 칸에 있었고, 그 근거는 *"우리 화면은
 * 표가 기본이고 간트는 「언제」만 보는 화면이라, 기간이 없어도 표의 줄은
 * 언제나 있다"* 였습니다. **그 전제가 `DEC-075` 로 사라졌습니다** — 표가
 * 없어지고 간트가 그 자리를 통째로 가져갔습니다.
 *
 * 원본이 이 자리를 고른 근거가 그대로 우리 근거가 됩니다:
 * ① **기간이 없는 항목은 막대가 아예 없습니다**(`toGanttEvents` 가 건너뜁니다) —
 *    막대에 두면 그런 항목에는 댓글을 열 길이 하나도 없습니다. 트리 줄은
 *    언제나 있습니다.
 * ② 막대는 좁습니다. 진척률 색·이름이 이미 그 폭을 쓰고 있습니다.
 *
 * ## 열림을 바깥이 쥘 수 있습니다
 *
 * 🔄 트리 줄을 누르면 그 항목의 댓글이 열려야 하는데, 그 누름을 받는 것은
 *    벤더의 줄(`onResourceClick`)이라 여기 배지 버튼이 아닙니다. 그래서
 *    `open`/`onOpenChange` 를 받습니다 — **두 입구가 한 창**을 엽니다.
 * ⚠️ 안 주면 지금까지처럼 스스로 엽니다(배지 하나로 여닫던 계약 그대로).
 *
 * ## 수는 함께 오고, 본문은 열 때 옵니다
 *
 * 항목이 수백 건인 프로젝트에서 한 장이 모든 댓글을 지고 오는데 실제로 열어
 * 보는 것은 하나입니다. 그래서 항목 목록과 함께 오는 것은 **수**뿐이고
 * (`project-item.service.listFor`), 본문은 여는 순간 서버 액션으로 옵니다.
 * 🔄 **바뀐 수를 위로 돌려줍니다**(`onCountChange`). 항목의 정본이 간트 화면의
 *    상태라(`project-gantt.tsx` 머리말) `router.refresh()` 를 부르면 낙관적
 *    갱신과 서버 값이 **두 정본**이 됩니다 — 그래서 배지 하나를 위해 화면을
 *    다시 읽지 않고 숫자만 올려 보냅니다.
 *
 * ## 무엇이 없는가
 *
 * ⛔ **멘션·답글·첨부·이모지가 없습니다** (`projectItemCommentSchema`). 칸은
 *    본문 하나입니다.
 * ⛔ **알림이 가지 않습니다.** 원본은 참가자에게 종을 울리지만 우리에게는
 *    프로젝트 참가자라는 개념이 없고(`DEC-018`: 승인 회원 전원), `Notification`
 *    표에도 댓글에 해당하는 종류가 없습니다. **아래 설명 문장이 그 사실을
 *    그대로 말합니다** — 안 적으면 남긴 사람은 상대가 알게 된다고 여깁니다.
 */

/** 이 컴포넌트가 다루는 항목 한 줄. 간트가 자기 상태에서 만들어 넘깁니다 */
export interface CommentTargetItem {
  id: string;
  title: string;
  /** 지금 화면이 아는 댓글 수 — 열기 전에는 이것이 유일한 값입니다 */
  commentCount: number;
}

/**
 * 「N분 전」이 아니라 **날짜·시각**을 적습니다.
 *
 * 그리고 `audit-table` 의 `createdAt.slice(0, 16)` 을 **따라 하지 않습니다.**
 * 그것은 ISO 문자열을 그대로 자르는 것이라 화면에 **UTC** 가 나옵니다 —
 * 관리자가 로그를 읽는 화면에서는 견딜 만하지만, 여기서는 방금 남긴 댓글이
 * 9시간 전으로 보입니다. 그건 사람이 바로 「틀렸다」고 아는 종류의 값입니다.
 */
function fmtWhen(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function ProjectItemComments({
  projectId,
  item,
  onCountChange,
  open: controlledOpen,
  onOpenChange,
  className,
}: {
  projectId: string;
  item: CommentTargetItem;
  /** 수가 바뀌면 알립니다 — 간트가 트리의 배지를 그 값으로 다시 그립니다 */
  onCountChange: (itemId: string, count: number) => void;
  /** 🔄 바깥에서 열 수 있습니다(트리 줄 클릭). 안 주면 배지가 스스로 엽니다 */
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  className?: string;
}) {
  const [selfOpen, setSelfOpen] = useState(false);
  const open = controlledOpen ?? selfOpen;
  /** `null` 은 «아직 안 왔다», `[]` 는 «정말 하나도 없다» — 다른 사실입니다 */
  const [list, setList] = useState<ItemComment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  /** 지금 고치고 있는 줄과 그 칸의 내용 */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  /**
   * **응답은 순서대로 오지 않습니다.**
   *
   * 넷 다 「바뀐 뒤의 목록」을 받아 그대로 갈아 끼우는데, 창을 열자마자 한 줄을
   * 남기면 **읽기 응답이 쓰기 응답보다 늦게 도착할 수 있습니다.** 그러면 방금
   * 남긴 줄이 화면에서 **사라졌다가** 다음에 열 때 다시 나타납니다 — 사람은
   * 「안 남겨졌다」고 여기고 한 번 더 남깁니다.
   *
   * 그래서 요청마다 번호를 달고, **자기가 최신일 때만** 반영합니다. 요청을 건
   * 쪽이 자기 번호를 들고 있으므로 취소 신호를 따로 주고받을 필요가 없습니다.
   */
  const reqSeq = useRef(0);
  function claim(): () => boolean {
    const mine = (reqSeq.current += 1);
    return () => mine === reqSeq.current;
  }

  /** 서버가 준 목록이 정본입니다 — 수도 여기서 함께 맞춥니다 */
  function apply(rows: ItemComment[]) {
    setList(rows);
    onCountChange(item.id, rows.length);
    setEditingId(null);
  }

  /**
   * 여닫기의 **유일한 통로**. 바깥이 열든 배지가 열든 여기를 지납니다.
   *
   * 🔴 **초기화를 「닫을 때」 합니다.** 바깥에서 열리는 길이 생기며 여는 쪽이
   *    둘이 되었는데, 초기화를 양쪽에 적으면 한쪽만 고쳐지는 날이 옵니다 —
   *    그리고 그 증상은 *"어떤 항목의 댓글이 다른 항목 창에 한 프레임 보인다"*
   *    라 재현이 어렵습니다. 닫을 때 비우면 **다음에 어느 길로 열어도**
   *    「불러오는 중」입니다.
   */
  function setOpen(next: boolean) {
    if (!next) {
      setList(null);
      setFailed(false);
      setDraft("");
      setEditingId(null);
    }
    if (onOpenChange) onOpenChange(next);
    else setSelfOpen(next);
  }

  /**
   * 🔴 **열 때마다 다시 읽습니다.** 댓글은 남이 쓰는 값이라 한 번 받아 두고
   *    캐시하면 화면을 열어 둔 채로 옛 목록을 보게 됩니다.
   * 🔴 **효과로 읽습니다** — `DEC-074` 때는 여닫는 함수 안에서 직접 불렀는데,
   *    바깥에서 열리는 길(트리 줄 클릭)이 생기면서 그 함수를 안 지나는 열림이
   *    생겼습니다. 여는 자리가 둘이면 읽는 자리도 둘이 되고, 그러면 한쪽 길로
   *    열었을 때만 목록이 안 오는 상태가 납니다.
   *
   * 🔴 **`await` 로 쓴 함수를 부르지 않고 `.then` 사슬을 여기 폅니다.**
   *    `async function load()` 를 만들어 `void load()` 로 부르면
   *    `react-hooks/set-state-in-effect` 가 막습니다 — 그 함수 안의 setState 가
   *    **효과 몸통에서 동기로 호출되는 것**으로 읽히기 때문입니다(실제로는
   *    `await` 뒤지만 규칙은 그 경계를 못 봅니다). `.then` 안이면 «외부 시스템의
   *    응답을 받은 자리»라 규칙이 허락하는 모양이 됩니다.
   * ⚠️ 그래서 이 효과는 **읽기만** 합니다 — 몸통에서 바꾸는 것은 `claim()` 의
   *    ref 하나뿐이고, 그건 상태가 아닙니다.
   *
   * ⚠️ `alive` 는 **언마운트**를 막고 `latest()` 는 **순서 뒤바뀜**을 막습니다.
   *    둘은 다른 사고라 둘 다 있어야 합니다.
   */
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const latest = claim();
    void listItemCommentsAction(projectId, item.id)
      .then((r) => {
        // 그 사이에 누가 한 줄 남겼으면 이 응답은 «옛 목록»입니다 — 버립니다
        if (!alive || !latest()) return;
        if (!r.ok) {
          /*
           * **조용히 빈 목록을 그리지 않습니다** — 「댓글이 없다」와 「못 읽었다」는
           * 다른 사실이고, 앞의 것으로 덮으면 사람은 첫 줄을 남기려 합니다.
           */
          setFailed(true);
          return;
        }
        apply(r.data);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 여는 순간에만 읽는다(콜백 참조가 바뀌어도 다시 안 읽는다)
  }, [open, item.id]);

  async function submit() {
    const clean = draft.trim();
    if (!clean || busy) return;
    setBusy(true);
    const latest = claim();
    const r = await addItemCommentAction(projectId, item.id, { body: clean });
    setBusy(false);
    if (!latest()) return;
    if (!r.ok) {
      toast.error(r.message ?? "댓글을 남기지 못했습니다.");
      return;
    }
    apply(r.data);
    // 안 비우면 같은 줄을 두 번 남기게 됩니다
    setDraft("");
  }

  async function saveEdit(id: string) {
    const clean = editDraft.trim();
    if (!clean || busy) return;
    setBusy(true);
    const latest = claim();
    const r = await updateItemCommentAction(projectId, item.id, id, {
      body: clean,
    });
    setBusy(false);
    if (!latest()) return;
    if (!r.ok) {
      toast.error(r.message ?? "댓글을 고치지 못했습니다.");
      return;
    }
    apply(r.data);
  }

  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    const latest = claim();
    const r = await deleteItemCommentAction(projectId, item.id, id);
    setBusy(false);
    if (!latest()) return;
    if (!r.ok) {
      toast.error(r.message ?? "댓글을 지우지 못했습니다.");
      return;
    }
    apply(r.data);
  }

  return (
    <>
      {/*
        🔴 **수가 0이어도 그립니다.** 0일 때 감추면 «첫 댓글을 다는 길»이
           사라집니다(막대의 우클릭 메뉴는 막대가 있는 항목에만 나오므로, 기간
           없는 항목에는 다른 길이 없습니다). 숫자는 있을 때만 적습니다 — 0을
           적으면 「없음」이 눈에 띄는 값이 됩니다.
        🔴 **`<Button>` 이 아니라 맨 `<button>` 입니다.** 트리 줄은 높이가
           좁은데(벤더의 lane) 공용 버튼은 `h-8` 을 갖고 있어 줄을 밀어냅니다.
        ⚠️ 벤더의 줄 클릭 핸들러는 `button` 을 **일부러 비껴갑니다**
           (`gantt-view.tsx` 의 `closest("button, [role=checkbox]")`) — 그래서
           여기 버튼을 두어도 줄 동작(댓글 열기)을 두 번 먹지 않습니다.
      */}
      <button
        type="button"
        data-slot="item-comments-open"
        onClick={() => setOpen(true)}
        aria-label={`${item.title} 댓글 ${item.commentCount}개`}
        className={cn(
          "text-muted-foreground hover:text-foreground focus-visible:ring-ring flex shrink-0 items-center gap-0.5 rounded px-1 text-[11px] font-semibold tabular-nums outline-none focus-visible:ring-2",
          item.commentCount > 0 && "text-foreground",
          className
        )}
      >
        <MessageSquare className="size-3.5" aria-hidden />
        {item.commentCount > 0 ? item.commentCount : null}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="truncate">
              「{item.title}」 댓글
            </DialogTitle>
            <DialogDescription className="leading-relaxed">
              {/*
                **여기가 「알림이 안 간다」를 말하는 유일한 자리입니다.** 안 적으면
                남긴 사람은 담당자가 알게 된다고 여기고, 급한 말을 여기 두고 갑니다.
              */}
              승인된 회원 모두가 읽고 씁니다.{" "}
              <strong>알림은 가지 않습니다</strong> — 급한 말은 댓글이 아니라
              사람에게 하세요. 고치는 것은 쓴 사람만, 지우는 것은 쓴 사람과
              프로젝트를 만든 사람·관리자입니다.
            </DialogDescription>
          </DialogHeader>

          {failed ? (
            <p className="text-destructive py-6 text-center text-sm">
              댓글을 불러오지 못했습니다. 창을 닫았다 다시 열어 주세요.
            </p>
          ) : list === null ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              <Loader2
                className="mr-1 inline size-4 animate-spin"
                aria-hidden
              />
              불러오는 중…
            </p>
          ) : list.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              아직 댓글이 없습니다. 첫 줄을 남겨 보세요.
            </p>
          ) : (
            /* **오래된 것부터**입니다(service 가 그 순서로 줍니다 — 기록이라서요).
               길어지면 안쪽만 구릅니다: 대화 상자가 화면 밖으로 자라지 않게. */
            <ul className="max-h-[45dvh] space-y-3 overflow-y-auto pr-1">
              {list.map((c) => (
                <li key={c.id} className="flex gap-2.5">
                  <PersonAvatar name={c.author.name} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      {/*
                        **누가 썼는지가 여기 남습니다.** 이름만 적습니다 — 아이디를
                        함께 그리면 목록이 계정 명단처럼 보이고, 그것은 이 화면이
                        말할 일이 아닙니다.
                      */}
                      <span className="text-sm font-semibold">
                        {displayName(c.author.name)}
                      </span>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {fmtWhen(c.createdAt)}
                        {c.edited ? " (고침)" : null}
                      </span>
                    </p>

                    {editingId === c.id ? (
                      <div className="mt-1 flex flex-col gap-1.5">
                        <Textarea
                          value={editDraft}
                          onChange={(e) =>
                            setEditDraft(
                              e.target.value.slice(0, ITEM_COMMENT_MAX)
                            )
                          }
                          rows={3}
                          aria-label="댓글 고쳐 쓰기"
                          disabled={busy}
                        />
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingId(null)}
                            disabled={busy}
                          >
                            <X className="size-4" />
                            그만두기
                          </Button>
                          <Button
                            size="sm"
                            disabled={busy || editDraft.trim().length === 0}
                            onClick={() => void saveEdit(c.id)}
                          >
                            <Check className="size-4" />
                            저장
                          </Button>
                        </div>
                      </div>
                    ) : (
                      /* `whitespace-pre-wrap` — 사람이 넣은 줄바꿈을 지우지 않습니다 */
                      <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
                        {c.body}
                      </p>
                    )}
                  </div>

                  {/*
                    **화면의 값은 관문이 아닙니다.** 실제로 막는 것은 service 입니다
                    (`assertCanEdit`) — 여기 있는 것은 「무엇을 그릴까」이고,
                    단추가 없다고 서버가 안 막는 것이 아닙니다.

                    고치기는 **본인만**이고 지우기는 **전원**이라 두 조건이 다릅니다.
                    남의 말을 그 사람 이름 아래에서 바꾸는 것은 조정이 아니라 위조입니다.
                    🔄 지우기가 「본인·프로젝트를 만든 사람·관리자」였다가 `DEC-077` 로
                    전원이 됐습니다 — 그래서 지우기 단추에는 조건이 없습니다.
                  */}
                  {editingId === c.id ? null : (
                    <div className="flex shrink-0 gap-0.5">
                      {c.mine && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-muted-foreground size-8"
                          aria-label="내 댓글 고치기"
                          disabled={busy}
                          onClick={() => {
                            setEditingId(c.id);
                            setEditDraft(c.body);
                          }}
                        >
                          <Pencil className="size-4" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive size-8"
                        /* 이름을 넣습니다 — 단추가 여럿이면 「댓글 지우기」 셋이
                             나란히 놓이고, 화면 낭독기에서 어느 것이 어느 것인지
                             알 길이 없습니다 (`NFR-A11Y-002`) */
                        aria-label={`${displayName(c.author.name)}의 댓글 지우기`}
                        disabled={busy}
                        onClick={() => void remove(c.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/*
            **로그인한 사람은 누구나 씁니다** (`DEC-018`). 🔄 전에 이 자리는
            「역할로 입력칸을 감추지 않는다」였습니다 — 감출 역할이 없어졌습니다
            (`DEC-077`).
          */}
          <div className="flex flex-col gap-2">
            <Textarea
              value={draft}
              onChange={(e) =>
                setDraft(e.target.value.slice(0, ITEM_COMMENT_MAX))
              }
              rows={3}
              placeholder="댓글을 남기세요"
              aria-label="댓글 입력"
              disabled={busy}
            />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs tabular-nums">
                {draft.length.toLocaleString()} /{" "}
                {ITEM_COMMENT_MAX.toLocaleString()}
              </span>
              <Button
                size="sm"
                disabled={busy || draft.trim().length === 0}
                onClick={() => void submit()}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                남기기
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
