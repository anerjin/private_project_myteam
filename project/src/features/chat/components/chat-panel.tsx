"use client";

import { MessageSquare, PanelRightClose, Send, Sparkles } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { MarkdownViewer } from "@/components/common/markdown-viewer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { describePage } from "@/features/chat/page-context";
import { cn } from "@/lib/utils";
import { askChatAction, chatStatusAction } from "@/server/actions/chat.actions";

/**
 * 오른쪽 도우미 패널 — 서비스 화면 전체.
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
}

const STORAGE_KEY = "qb.chat.open";

export function ChatPanel() {
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
    }, 0);
    return () => clearTimeout(timer);
  }, []);

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
    setTurns((t) => [
      ...t,
      { role: "bot", text: r.data.reply, ms: r.data.ms },
    ]);
  }

  if (!open) {
    return (
      <Button
        size="icon"
        // 닫혀 있을 때의 단추도 같은 색 계열로 — 도우미는 언제나 어둡습니다
        className="dark bg-sidebar text-foreground hover:bg-sidebar-accent fixed right-4 bottom-4 z-30 size-11 rounded-full border shadow-lg"
        aria-label="도우미 열기"
        onClick={() => toggle(true)}
      >
        <MessageSquare className="size-5" />
      </Button>
    );
  }

  return (
    <aside
      aria-label="도우미"
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
        <span className="text-sm font-medium">도우미</span>
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto"
          aria-label="도우미 닫기"
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
            Claude Code CLI 를 찾지 못했습니다. 이 PC 에 설치돼 있어야 도우미가
            돕니다.
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
            {t.role === "bot" ? (
              <MarkdownViewer content={t.text} className="prose-sm" />
            ) : (
              t.text
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
          aria-label="도우미에게 보낼 말"
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
