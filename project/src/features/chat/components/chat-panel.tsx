"use client";

import {
  Eraser,
  MessageSquare,
  PanelRightClose,
  Send,
  Sparkles,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { MarkdownViewer } from "@/components/common/markdown-viewer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ASSISTANT } from "@/features/chat/assistant";
import { describePage } from "@/features/chat/page-context";
import { cn } from "@/lib/utils";
import { askChatAction, chatStatusAction } from "@/server/actions/chat.actions";
import { deleteResourceAction } from "@/server/actions/resource.actions";

/**
 * 오른쪽 도우미 패널 — 서비스 화면 전체. 도우미의 이름은 **「디오」**입니다.
 *
 * 이름은 `features/chat/assistant` 한 곳에 있습니다 — 화면 문구·`aria-label` ·
 * 프롬프트가 **같은 값**을 씁니다.
 *
 * ## 지금 어느 화면인지 **보여 줍니다**
 *
 * 칩에 그 이름이 뜨고, 같은 설명이 프롬프트에도 실립니다
 * (`features/chat/page-context` 한 곳에서 만듭니다). 사용자가 「이거 뭐야」라고
 * 물었을 때 무엇을 가리키는지 서로 같은 것을 봐야 합니다.
 *
 * ## 관리 영역에는 안 붙입니다
 *
 * 서비스 레이아웃에만 답니다. 관리 화면은 폭이 좁고, 거기서 필요한 것은
 * 대화가 아니라 표입니다.
 *
 * ## 못 쓰는 상태를 «말합니다»
 *
 * CLI 가 없거나 검색 키가 없으면 조용히 안 되는 대신 그 이유를 적습니다 —
 * 이 저장소가 반복해서 지워 온 「눌러도 아무 일이 없는」 자리입니다.
 */

interface Turn {
  role: "me" | "bot";
  text: string;
  ms?: number;
  /** 자동 등록 결과 — 링크와 되돌리기를 답 밑에 답니다 */
  created?: { id: string; title: string; href: string };
  /** 등록을 시도했지만 못 한 이유 */
  note?: string;
  undone?: boolean;
  /** 앞의 대화를 이어붙이지 못했다 — 말풍선은 남아 있지만 모델은 모릅니다 */
  lostThread?: boolean;
}

const STORAGE_KEY = "qb.chat.open";

/**
 * 나눈 이야기를 **이 브라우저에** 남깁니다 (`localStorage`).
 *
 * ## 왜 DB 가 아닌가
 *
 * 대화는 자료가 아닙니다. DB 에 넣으면 백업·보존기간·익명화·감사에 전부
 * 얹혀야 하고(`NFR-PRIV-*`), 그 값에 비해 얻는 것이 「새로고침해도 남는다」
 * 하나입니다. 브라우저에 두면 **그 사람 PC 밖으로 나가지 않습니다.**
 *
 * 대신 이런 성질입니다 — 기기가 바뀌면 안 따라오고, 브라우저 데이터를
 * 지우면 사라집니다. 사내 도우미에는 그 정도가 맞습니다.
 *
 * ## 사람마다 다른 열쇠를 씁니다
 *
 * 한 PC 를 여러 사람이 쓰면 앞사람 대화가 뒷사람에게 보입니다. 열쇠에
 * `userId` 를 넣어 **다른 사람으로 로그인하면 안 보이게** 합니다.
 */
const historyKey = (userId: string) => `qb.chat.hist.${userId}`;

/**
 * 남길 말풍선 수. `localStorage` 는 origin 당 5MB 안팎이고 **이 저장소를
 * 다른 것도 씁니다** — 대화가 그걸 다 먹으면 안 됩니다.
 */
const KEEP_TURNS = 60;

interface Saved {
  sessionId: string | null;
  turns: Turn[];
}

function load(userId: string): Saved | null {
  try {
    const raw = window.localStorage.getItem(historyKey(userId));
    if (!raw) return null;
    const v = JSON.parse(raw) as Saved;
    // 남의 손이 닿았거나 형태가 바뀐 값 — 없는 셈 칩니다
    if (!Array.isArray(v?.turns)) return null;
    return v;
  } catch {
    return null;
  }
}

function save(userId: string, v: Saved): void {
  try {
    /*
     * **빈 대화는 «지웁니다», 빈 값으로 쓰지 않습니다.**
     *
     * 「대화 지우기」가 `removeItem` 을 해도 곧바로 저장 이펙트가 돌아
     * `{turns: []}` 를 도로 써 넣었습니다 — 지운 자리에 껍데기가 남습니다.
     * 쓰는 곳을 여기 하나로 두고, 비면 열쇠째 없앱니다.
     */
    if (v.turns.length === 0) {
      window.localStorage.removeItem(historyKey(userId));
      return;
    }
    window.localStorage.setItem(
      historyKey(userId),
      JSON.stringify({ ...v, turns: v.turns.slice(-KEEP_TURNS) })
    );
  } catch {
    /*
     * 저장소가 꽉 찼거나(QuotaExceeded) 막혀 있습니다. **여기서 죽으면
     * 대화 자체가 멈춥니다** — 남기지 못할 뿐이므로 그냥 갑니다.
     */
  }
}

export function ChatPanel({ userId }: { userId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const page = describePage(pathname, searchParams.get("q") ?? undefined);

  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<{
    available: boolean;
    tools: boolean;
  } | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  /** 저장해 둔 것을 읽기 «전»에 저장해 덮어쓰지 않기 위한 빗장 */
  const [ready, setReady] = useState(false);
  const restored = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  /*
   * 접었는지 폈는지는 **이 브라우저에만** 기억합니다.
   *
   * **`useState` 초기값으로 읽지 않습니다.** 서버 렌더에는 `localStorage` 가
   * 없어 항상 «닫힘»이 나오고, 클라이언트 첫 렌더가 «열림»이면 하이드레이션이
   * 어긋납니다.
   *
   * **타이머 안에서 `setState` 를 부릅니다.** 이펙트 본문에서 곧바로 부르면
   * `react-hooks/set-state-in-effect` 가 잡습니다 — `tag-input` 이 같은 규칙에
   * 걸렸던 자리이고, 해법도 같습니다.
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        setOpen(window.localStorage.getItem(STORAGE_KEY) === "1");
      } catch {
        /* 저장소를 막아 둔 브라우저 — 닫힌 채로 시작합니다 */
      }
      // 나눈 이야기도 같은 타이밍에 되살립니다 (하이드레이션 뒤)
      const saved = load(userId);
      if (saved) {
        setTurns(saved.turns);
        setSessionId(saved.sessionId);
        restored.current = true;
      }
      setReady(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [userId]);

  /*
   * **되살리기 전에는 저장하지 않습니다.**
   *
   * 첫 렌더의 빈 `turns` 를 그대로 쓰면 저장해 둔 대화를 **읽기도 전에
   * 빈 값으로 덮습니다.** `ready` 가 그 순서를 지킵니다.
   */
  useEffect(() => {
    if (!ready) return;
    save(userId, { sessionId, turns });
  }, [ready, userId, sessionId, turns]);

  useEffect(() => {
    if (!open || status) return;
    chatStatusAction().then((r) => {
      if (r.ok) setStatus(r.data);
      else setStatus({ available: false, tools: false });
    });
  }, [open, status]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, pending]);

  /*
   * **열림 여부를 `<html>` 에 답니다.**
   *
   * 패널은 고정 위치라 본문 위에 뜹니다. 본문 열을 그만큼 밀어야 가려지지
   * 않는데, 그 폭을 아는 것은 패널 자신입니다 — 상태를 서버 레이아웃으로
   * 끌어올리면 그 레이아웃이 통째로 클라이언트 컴포넌트가 되고, 화면마다
   * 서버에서 하던 조회가 전부 클라이언트로 밀립니다.
   *
   * 규칙은 `globals.css` 의 `html[data-chat="open"]` 한 곳에 있습니다.
   */
  useEffect(() => {
    document.documentElement.dataset.chat = open ? "open" : "closed";
    return () => {
      delete document.documentElement.dataset.chat;
    };
  }, [open]);

  function toggle(next: boolean) {
    setOpen(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* 못 저장해도 이번 세션에서는 그대로 동작합니다 */
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text || pending) return;
    setDraft("");
    setTurns((t) => [...t, { role: "me", text }]);
    setPending(true);

    const r = await askChatAction({
      message: text,
      pathname,
      query: searchParams.get("q") ?? undefined,
      sessionId: sessionId ?? undefined,
    });
    setPending(false);

    if (!r.ok) {
      setTurns((t) => [
        ...t,
        { role: "bot", text: r.message ?? "대답을 받지 못했습니다." },
      ]);
      return;
    }
    setSessionId(r.data.sessionId);
    /*
     * 되살린 대화를 **모델이 못 이어받았을 때**만 한 번 말합니다. 말풍선은
     * 남아 있는데 모델이 앞을 모르면 사용자는 「왜 갑자기 모르지」로 헤맵니다.
     */
    const lost = !r.data.resumed && restored.current;
    restored.current = false;
    setTurns((t) => [
      ...t,
      {
        role: "bot",
        text: r.data.reply,
        ms: r.data.ms,
        created: r.data.created,
        note: r.data.registerNote,
        lostThread: lost,
      },
    ]);
    if (r.data.created) router.refresh();
  }

  /** 나눈 이야기를 지웁니다 — 남는 곳이 생겼으니 **비울 자리**도 있어야 합니다 */
  function clearHistory() {
    setTurns([]);
    setSessionId(null);
    restored.current = false;
    // 저장소는 건드리지 않습니다 — 비면 `save` 가 열쇠째 없앱니다
  }

  /**
   * 되돌리기 — **휴지통으로** 보냅니다 (`FR-RES-008`, 30일 유예).
   *
   * 자동 등록은 한 마디로 자료가 생기는 일이라, 되돌릴 자리가 같은 화면에
   * 있어야 합니다. 영구 삭제가 아니라 소프트 삭제라 관리자가 복구할 수도
   * 있습니다.
   */
  async function undo(turnIndex: number, id: string) {
    const r = await deleteResourceAction(id);
    if (!r.ok) {
      toast.error(r.message ?? "되돌리지 못했습니다.");
      return;
    }
    setTurns((t) =>
      t.map((x, i) => (i === turnIndex ? { ...x, undone: true } : x))
    );
    toast.success("휴지통으로 옮겼습니다.");
    router.refresh();
  }

  if (!open) {
    return (
      <Button
        size="icon"
        // 닫혀 있을 때의 단추도 같은 색 계열로 — 도우미는 언제나 어둡습니다
        className="dark bg-sidebar text-foreground hover:bg-sidebar-accent fixed right-4 bottom-4 z-30 size-11 rounded-full border shadow-lg"
        aria-label={`${ASSISTANT} 열기`}
        onClick={() => toggle(true)}
      >
        <MessageSquare className="size-5" />
      </Button>
    );
  }

  return (
    <aside
      // 이름만으로는 «무엇인지» 모릅니다 — 랜드마크에는 역할을 함께 답니다
      aria-label={`${ASSISTANT} 도우미`}
      className={cn(
        /*
         * **언제나 어두운 색입니다.**
         *
         * `.dark` 를 여기 걸면 `globals.css` 의 다크 토큰이 이 상자와 그
         * 자손에게 적용됩니다 — 앱 테마가 밝든 어둡든 도우미만 어둡습니다.
         *
         * **`text-foreground` 를 다시 거는 이유**: `body` 가 이미
         * `color: var(--foreground)` 를 «밝은 값으로 계산해» 상속시킵니다.
         * 커스텀 속성은 쓰이는 그 자리에서 치환되므로, 여기서 한 번 더
         * 써 줘야 다크 값으로 다시 계산됩니다. 안 그러면 어두운 바탕에
         * 밝은 테마의 검은 글씨가 얹힙니다.
         */
        "dark bg-sidebar text-foreground z-40 flex flex-col border-l",
        /*
         * **뷰포트에 고정입니다.** 헤더·사이드바·본문 «전체» 오른쪽에 서고,
         * 본문 열은 `globals.css` 가 `--chat-width` 만큼 밀어 줍니다.
         *
         * 본문 흐름 안에 두면 문서 높이만큼 늘어나 입력창이 화면 밖으로
         * 밀립니다 — 처음에 그렇게 붙였다가 자료 목록에서 `top=2722px` 가
         * 됐고, 한 화면에 들어오는 짧은 페이지에서만 보였습니다.
         */
        "fixed inset-y-0 right-0",
        // 좁은 화면에서는 옆에 둘 자리가 없어 통째로 덮습니다
        "left-0 md:left-auto md:w-[var(--chat-width)]"
      )}
    >
      {/* 머리·맥락·입력은 `shrink-0` — **스크롤은 말풍선 영역만** 합니다 */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
        <Sparkles className="text-muted-foreground size-4" />
        <span className="text-sm font-medium">{ASSISTANT}</span>
        <span className="text-muted-foreground text-xs">자료 도우미</span>
        {/*
          대화가 브라우저에 남으므로 **비울 자리**가 있어야 합니다.
          없으면 지난주 이야기를 계속 이고 다니게 됩니다.
        */}
        {turns.length > 0 && (
          <Button
            size="icon"
            variant="ghost"
            className="ml-auto"
            aria-label="대화 지우기"
            title="나눈 이야기를 지웁니다"
            onClick={clearHistory}
          >
            <Eraser className="size-4" />
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className={turns.length > 0 ? undefined : "ml-auto"}
          aria-label={`${ASSISTANT} 닫기`}
          onClick={() => toggle(false)}
        >
          <PanelRightClose className="size-4" />
        </Button>
      </header>

      {/* **지금 어느 화면인지** — 답이 이 맥락 위에서 나옵니다 */}
      <div className="shrink-0 border-b px-3 py-2">
        <span className="text-muted-foreground text-xs">보고 있는 화면</span>
        <p className="truncate text-sm font-medium" title={page.detail}>
          {page.label}
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {status && !status.available && (
          <Notice>
            Claude Code CLI 를 찾지 못했습니다. 이 PC 에 설치돼 있어야{" "}
            {ASSISTANT}가 돕니다.
          </Notice>
        )}
        {status?.available && !status.tools && (
          <Notice>
            자료 검색 도구가 꺼져 있습니다 (<code>CHAT_API_KEY</code>). 화면
            안내는 되지만 자료를 찾아 주지는 못합니다.
          </Notice>
        )}

        {turns.length === 0 && (
          <div className="text-muted-foreground space-y-2 text-sm">
            <p className="text-foreground">
              안녕하세요, <b>{ASSISTANT}</b>입니다. 사내에 등록된 자료를 찾아
              드리고, 새 자료 등록도 도와드립니다.
            </p>
            <p>이 화면에서 물어볼 만한 것:</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>«드론 사진측량» 자료 찾아 줘</li>
              <li>이 화면에서 뭘 할 수 있어?</li>
              <li>이 저장소랑 비슷한 자료 있어?</li>
            </ul>
          </div>
        )}

        {turns.map((t, i) => (
          <div
            key={i}
            className={cn(
              "rounded-lg px-3 py-2 text-sm",
              t.role === "me"
                ? "bg-primary text-primary-foreground ml-6 whitespace-pre-wrap"
                : "bg-background mr-6 border"
            )}
          >
            {/*
              **답은 마크다운입니다.** 그대로 그리면 `**굵게**` 가 별표째
              보입니다. 자료 본문이 쓰는 뷰어를 그대로 씁니다 —
              `rehype-sanitize` 를 지나므로 모델이 무엇을 뱉든 태그가 살아
              나가지 않습니다 (`NFR-SEC-007`).
            */}
            {/*
              **앞을 못 이어받았으면 그렇다고 말합니다.** 말풍선은 위에 그대로
              남아 있는데 모델만 기억을 잃은 상태라, 안 말하면 사용자는
              「방금 말했잖아」로 헤맵니다.
            */}
            {t.lostThread && (
              <p className="text-muted-foreground mb-2 border-b pb-2 text-xs">
                앞의 대화를 이어가지 못했습니다 — 위 내용은 남아 있지만{" "}
                {ASSISTANT}는 여기서부터 다시 시작합니다.
              </p>
            )}
            {t.role === "bot" ? (
              <MarkdownViewer content={t.text} className="prose-sm" />
            ) : (
              t.text
            )}
            {/* 등록됐으면 «무엇이 생겼는지»와 되돌릴 길을 같은 자리에 둡니다 */}
            {t.created && (
              <div className="bg-muted mt-2 rounded-md p-2">
                <p className="text-xs">
                  {t.undone ? "휴지통으로 옮겼습니다" : "등록했습니다"}
                </p>
                <Link
                  href={t.created.href}
                  className="mt-0.5 block truncate text-sm font-medium underline underline-offset-4"
                >
                  {t.created.title}
                </Link>
                {!t.undone && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-1 h-7 px-2 text-xs"
                    onClick={() => void undo(i, t.created!.id)}
                  >
                    <Undo2 className="size-3" />
                    되돌리기
                  </Button>
                )}
              </div>
            )}
            {t.note && (
              <p className="text-muted-foreground mt-2 text-xs">{t.note}</p>
            )}
            {t.ms !== undefined && (
              <span className="text-muted-foreground mt-1 block text-xs">
                {(t.ms / 1000).toFixed(1)}초
              </span>
            )}
          </div>
        ))}

        {pending && (
          <div className="bg-background text-muted-foreground mr-6 rounded-lg border px-3 py-2 text-sm">
            생각 중… (자료를 찾으면 10초쯤 걸립니다)
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 border-t p-3">
        <Textarea
          rows={2}
          value={draft}
          placeholder="무엇을 도와드릴까요?"
          aria-label={`${ASSISTANT}에게 보낼 말`}
          disabled={pending || status?.available === false}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter 는 보내기, Shift+Enter 는 줄바꿈 — 채팅의 관습입니다
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button
          className="mt-2 w-full"
          disabled={pending || !draft.trim() || status?.available === false}
          onClick={() => void send()}
        >
          <Send className="size-4" />
          {pending ? "기다리는 중…" : "보내기"}
        </Button>
      </div>
    </aside>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-muted text-muted-foreground rounded-lg px-3 py-2 text-xs leading-relaxed">
      {children}
    </div>
  );
}
