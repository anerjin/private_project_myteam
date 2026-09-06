"use client";

import {
  AudioLines,
  Eraser,
  MessageSquare,
  MessageSquareText,
  Moon,
  PanelRightClose,
  Send,
  Sparkles,
  Sun,
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
import { VoiceBar, VoiceStage } from "@/features/chat/components/voice-mode";
import { describePage } from "@/features/chat/page-context";
import { useVoice } from "@/features/chat/voice/use-voice";
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
 * 패널의 밝기 — **앱 테마와 따로 놉니다.**
 *
 * 도우미는 원래 언제나 어두웠습니다(상자에 `.dark` 를 박아 두었습니다). 밝은
 * 화면에서 그 대비가 「여기는 다른 것」이라고 말해 주지만, 하루 종일 밝게 쓰는
 * 사람에게는 그냥 눈에 걸립니다. 그래서 **고를 수 있게** 합니다.
 *
 * 헤더의 테마 단추(`components/layout/theme-toggle`)는 앱 전체를 바꿉니다.
 * 여기 것은 **이 상자만** 바꿉니다 — 어두운 앱 안에서 도우미만 밝게 두는 것도
 * 됩니다(그 조합을 `globals.css` 의 `dark` 변형이 받쳐 줍니다).
 *
 * 열림 여부(`qb.chat.open`)와 같은 성질이라 **같은 방식으로** 둡니다 — 이
 * 브라우저에만 남고 사람마다 나뉘지 않습니다. 사람마다 나눠야 하는 것은
 * 대화 내용이지(`historyKey`) 「패널이 어떻게 보이는가」가 아닙니다.
 */
const THEME_KEY = "qb.chat.theme";

type PanelTheme = "dark" | "light";

/**
 * 글로 묻는가, 말로 묻는가.
 *
 * **디오는 하나입니다.** 음성 모드는 입력 방식과 겉모습(캐릭터)만 바꾸고,
 * 말은 채팅과 **같은 `send`** 를 지나 같은 대화 기록에 쌓입니다. 밝기와 같은
 * 성질이라 같은 방식으로 이 브라우저에 남깁니다.
 */
const MODE_KEY = "qb.chat.mode";

type PanelMode = "chat" | "voice";

/**
 * 패널 너비 — **경계를 끌어서** 정합니다.
 *
 * ## 변수 하나가 둘을 움직입니다
 *
 * 패널의 폭도(`md:w-[var(--chat-width)]`) 본문 열이 밀리는 양도
 * (`globals.css` 의 `padding-right`) **같은 `--chat-width`** 를 봅니다. 그래서
 * 끌 때 고칠 것은 그 변수 하나뿐이고, 둘이 어긋날 자리가 없습니다 — 폭을
 * 두 곳에 적었으면 끄는 동안 본문 밑에 패널이 겹쳐 들어갔을 것입니다.
 *
 * 값은 `<html>` 에 인라인으로 씁니다. 인라인이 스타일시트를 이기므로
 * `:root` 의 기본값도, 1024px 에서 커지는 규칙도 함께 덮습니다 — **끌고 난
 * 뒤에는 그 사람이 정한 폭이 정본**입니다.
 *
 * ## 한계는 창이 정합니다
 *
 * 위쪽 한계를 720px 로 두지만, 좁은 창에서는 그보다 먼저 **본문에 360px 는
 * 남겨야** 합니다. 안 그러면 패널을 넓히다 본문이 사라집니다. 창 크기가 바뀌면
 * 다시 재 봅니다 — 안 그러면 창을 줄인 순간 패널이 화면보다 넓어집니다.
 */
const WIDTH_KEY = "qb.chat.width";
const MIN_WIDTH = 280;
const MAX_WIDTH = 720;
/** 본문에 남겨 두는 최소 폭 */
const KEEP_FOR_MAIN = 360;
/** 화살표 한 번에 움직이는 양 */
const NUDGE = 16;

function clampWidth(px: number): number {
  const max = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, window.innerWidth - KEEP_FOR_MAIN));
  return Math.round(Math.min(max, Math.max(MIN_WIDTH, px)));
}

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
  /*
   * **첫 렌더는 언제나 「어둡게」입니다.** 저장된 값을 `useState` 초기값으로
   * 읽으면 서버 렌더와 어긋납니다 — `open` 과 같은 이유이고, 같은 타이밍에
   * 되살립니다.
   */
  const [theme, setTheme] = useState<PanelTheme>("dark");
  const [mode, setMode] = useState<PanelMode>("chat");
  /**
   * `null` 이면 **CSS 기본값 그대로**입니다 — 아직 아무도 안 끌었다는 뜻이고,
   * 그동안은 화면 크기에 따라 20rem·24rem 이 그대로 삽니다.
   */
  const [width, setWidth] = useState<number | null>(null);
  const asideRef = useRef<HTMLElement>(null);
  /** 끄는 «동안»의 최신값. 상태는 다음 렌더에 오므로 놓는 순간에는 늦습니다 */
  const widthRef = useRef<number | null>(null);
  /**
   * **사람이 «원한» 폭.** `width` 는 창에 맞춰 줄어든 «지금» 값이라 둘이
   * 갈립니다 — 창을 줄였다 다시 넓혔을 때 원래대로 돌아오려면 원한 값을
   * 따로 들고 있어야 합니다. 이것이 없으면 한 번 좁아진 폭이 영영 그대로입니다.
   */
  const desiredRef = useRef<number | null>(null);
  const dragging = useRef(false);
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
        // 저장해 둔 값이 «밝게»일 때만 바꿉니다 — 없으면 원래대로 어둡습니다
        if (window.localStorage.getItem(THEME_KEY) === "light") {
          setTheme("light");
        }
        if (window.localStorage.getItem(MODE_KEY) === "voice") {
          setMode("voice");
        }
        const savedWidth = Number(window.localStorage.getItem(WIDTH_KEY));
        // 끈 적이 없으면 손대지 않습니다 — CSS 의 반응형 폭이 그대로 삽니다
        if (Number.isFinite(savedWidth) && savedWidth > 0) {
          desiredRef.current = savedWidth;
          setWidth(clampWidth(savedWidth));
        }
      } catch {
        /* 저장소를 막아 둔 브라우저 — 닫힌 채로 어둡게 시작합니다 */
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
    /*
     * **거부도 받습니다.** `.then` 만 달면 액션이 던졌을 때 아무 일도 안 일어나고
     * 패널은 「확인 중」에 영원히 멈춥니다 — 못 쓰는 이유를 말해야 할 자리에서
     * 아무 말도 안 하는 셈입니다.
     */
    chatStatusAction()
      .then((r) => setStatus(r.ok ? r.data : { available: false, tools: false }))
      .catch(() => setStatus({ available: false, tools: false }));
  }, [open, status]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, pending]);

  /*
   * 음성은 **`send` 를 그대로 씁니다.** 패널을 닫거나 채팅 모드로 돌아가면
   * `enabled` 가 꺼지고 훅이 듣기·말하기를 그 자리에서 멈춥니다.
   */
  const voice = useVoice({
    enabled: open && mode === "voice",
    onSend: (text) => send(text),
  });

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

  /*
   * **정한 폭도 `<html>` 에 답니다.** 패널과 본문 열이 같은 변수를 보므로
   * 여기 한 번 쓰면 둘이 함께 움직입니다 (`WIDTH_KEY` 주석).
   */
  useEffect(() => {
    const root = document.documentElement;
    widthRef.current = width;
    if (width === null) return;
    root.style.setProperty("--chat-width", `${width}px`);
    return () => {
      root.style.removeProperty("--chat-width");
    };
  }, [width]);

  /*
   * **창이 바뀌면 다시 잽니다.**
   *
   * 줄일 때는 넓게 잡아 둔 폭이 화면보다 넓어지는 것을 막고(본문이 통째로
   * 패널 밑으로 들어갑니다), 넓힐 때는 **원래 원했던 폭으로 되돌립니다** —
   * 지금 값으로 다시 재면 한 번 좁아진 폭이 영영 그대로입니다.
   */
  useEffect(() => {
    const onResize = () =>
      setWidth((w) => (w === null ? w : clampWidth(desiredRef.current ?? w)));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function toggle(next: boolean) {
    setOpen(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* 못 저장해도 이번 세션에서는 그대로 동작합니다 */
    }
  }

  /**
   * 지금 폭. 아직 안 끌었으면 **재 봅니다** — 화면 크기에 따라 20rem 일 수도
   * 24rem 일 수도 있어서, 여기서 상수를 적으면 첫 한 번이 튑니다.
   */
  function currentWidth(): number {
    return (
      width ?? asideRef.current?.getBoundingClientRect().width ?? MIN_WIDTH
    );
  }

  function remember(px: number) {
    try {
      window.localStorage.setItem(WIDTH_KEY, String(px));
    } catch {
      /* 못 저장해도 이번 세션에서는 그대로 넓습니다 */
    }
  }

  /*
   * **포인터를 «잡습니다»** (`setPointerCapture`).
   *
   * 안 잡으면 빨리 끌 때 커서가 손잡이를 앞질러 나가고, 그 순간부터 움직임이
   * 안 옵니다 — 「끌다가 멈춘다」가 됩니다. 잡아 두면 포인터가 어디에 있든
   * 이 요소가 계속 받고, 창 밖에서 손을 떼도 `pointerup` 이 옵니다.
   */
  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    // 끄는 동안 글자가 잡히지 않게 — 규칙은 `globals.css` 한 곳에 있습니다
    document.documentElement.dataset.chatResizing = "";
  }

  function moveResize(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    // 패널은 오른쪽에 붙어 있으므로 «창 너비 − 커서» 가 곧 폭입니다
    const next = clampWidth(window.innerWidth - e.clientX);
    widthRef.current = next;
    desiredRef.current = next;
    setWidth(next);
  }

  function endResize(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    delete document.documentElement.dataset.chatResizing;
    // 저장은 **놓을 때 한 번**. 움직일 때마다 쓰면 초당 수십 번이 됩니다
    if (widthRef.current !== null) remember(widthRef.current);
  }

  /** 마우스 없이도 조절할 수 있어야 합니다 (`NFR-A11Y-002`) */
  function nudge(e: React.KeyboardEvent<HTMLDivElement>) {
    const max = Math.max(
      MIN_WIDTH,
      Math.min(MAX_WIDTH, window.innerWidth - KEEP_FOR_MAIN)
    );
    // 패널이 오른쪽이라 **왼쪽 화살표가 넓히는 쪽**입니다
    const next =
      e.key === "ArrowLeft"
        ? currentWidth() + NUDGE
        : e.key === "ArrowRight"
          ? currentWidth() - NUDGE
          : e.key === "Home"
            ? max
            : e.key === "End"
              ? MIN_WIDTH
              : null;
    if (next === null) return;
    e.preventDefault();
    const w = clampWidth(next);
    widthRef.current = w;
    desiredRef.current = w;
    setWidth(w);
    remember(w);
  }

  /** 이 상자만 밝게·어둡게. **앱 테마는 건드리지 않습니다** */
  function toggleTheme() {
    const next: PanelTheme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      /* 못 저장해도 이번 세션에서는 그대로 바뀝니다 */
    }
  }

  /**
   * 묻고 답을 받습니다 — 글로든 말로든 **이 하나**를 지납니다.
   *
   * 답 글을 돌려주는 이유는 음성 모드가 그것을 **읽어 주기** 때문입니다.
   * 말풍선을 뒤져서 «마지막 bot» 을 찾게 하면 오류 말풍선까지 읽습니다.
   */
  async function send(spoken?: string): Promise<string | null> {
    const text = (spoken ?? draft).trim();
    if (!text || pending) return null;
    if (spoken === undefined) setDraft("");
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
      return null;
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
    return r.data.reply;
  }

  /** 글 ↔ 말. 밝기 단추와 같은 결 — **누르면 되는 것**을 아이콘으로 보여 줍니다 */
  function toggleMode() {
    const next: PanelMode = mode === "chat" ? "voice" : "chat";
    setMode(next);
    try {
      window.localStorage.setItem(MODE_KEY, next);
    } catch {
      /* 못 저장해도 이번 세션에서는 그대로 바뀝니다 */
    }
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
        // 닫혀 있을 때의 단추도 **패널과 같은 밝기**로 — 열었을 때 색이 안 바뀝니다
        className={cn(
          theme,
          "bg-sidebar text-foreground hover:bg-sidebar-accent fixed right-4 bottom-4 z-30 size-11 rounded-full border shadow-lg"
        )}
        aria-label={`${ASSISTANT} 열기`}
        onClick={() => toggle(true)}
      >
        <MessageSquare className="size-5" />
      </Button>
    );
  }

  return (
    <aside
      ref={asideRef}
      // 이름만으로는 «무엇인지» 모릅니다 — 랜드마크에는 역할을 함께 답니다
      aria-label={`${ASSISTANT} 도우미`}
      className={cn(
        /*
         * **밝기를 이 상자가 «스스로» 정합니다.**
         *
         * `dark`·`light` 중 하나를 여기 걸면 `globals.css` 의 그 토큰이 이
         * 상자와 자손에게 적용됩니다 — 앱 테마가 무엇이든 도우미는 고른 대로
         * 보입니다. 기본은 어둡고(`theme` 초기값), 고른 값은 이 브라우저에
         * 남습니다.
         *
         * **`text-foreground` 를 다시 거는 이유**: `body` 가 이미
         * `color: var(--foreground)` 를 «그때의 값으로 계산해» 상속시킵니다.
         * 커스텀 속성은 쓰이는 그 자리에서 치환되므로, 여기서 한 번 더
         * 써 줘야 이 상자의 값으로 다시 계산됩니다. 안 그러면 바탕만 바뀌고
         * 글씨는 바깥 테마의 색으로 얹힙니다.
         */
        theme,
        "bg-sidebar text-foreground z-40 flex flex-col border-l",
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
      {/*
        **왼쪽 경계를 끌어 폭을 정합니다.**

        상자 왼쪽에 걸치게 둡니다(`-left-1`) — 경계 «위»에 커서를 올려야 잡히는데,
        안쪽에만 두면 그 8px 이 패널 내용과 겹쳐 스크롤바 근처에서 헷갈립니다.

        좁은 화면에서는 패널이 **화면을 통째로 덮으므로** 조절할 것이 없습니다.
        그래서 `md` 부터만 답니다 — 폭을 미는 규칙(`globals.css`)도 같은 경계입니다.

        `role="separator"` + `tabindex` 는 «움직일 수 있는 칸막이»입니다.
        마우스가 없어도 화살표로 조절되어야 합니다.
      */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="도우미 너비 조절"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        {...(width !== null ? { "aria-valuenow": width } : {})}
        tabIndex={0}
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onKeyDown={nudge}
        className={cn(
          "absolute inset-y-0 -left-1 z-10 hidden w-2 md:block",
          "cursor-col-resize touch-none",
          // 평소엔 안 보이다가 손이 가면 드러납니다 — 늘 보이면 선이 하나 더 생깁니다
          "hover:bg-primary/40 focus-visible:bg-primary/40 transition-colors",
          "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none"
        )}
      />

      {/* 머리·맥락·입력은 `shrink-0` — **스크롤은 말풍선 영역만** 합니다 */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
        <Sparkles className="text-muted-foreground size-4" />
        <span className="text-sm font-medium">{ASSISTANT}</span>
        <span className="text-muted-foreground text-xs">자료 도우미</span>
        {/*
          대화가 브라우저에 남으므로 **비울 자리**가 있어야 합니다.
          없으면 지난주 이야기를 계속 이고 다니게 됩니다.
        */}
        {/*
          **패널만의 밝기입니다.** 헤더의 테마 단추는 앱 전체를 바꾸고,
          이것은 이 상자만 바꿉니다. 그래서 아이콘도 «지금»이 아니라
          **누르면 되는 것**을 보여 줍니다 — 어두울 때 해, 밝을 때 달.
          한 자리에 두 뜻이 겹치면 아무도 안 누릅니다.

          `ml-auto` 는 **언제나 있는 이 단추**가 답니다. 「대화 지우기」에
          달아 두면 대화가 없는 동안 단추들이 제목에 붙어 버립니다.
        */}
        {/*
          **글 ↔ 말.** 음성 모드는 «실험»입니다 — 브라우저 내장 음성 인식과
          three.js 캐릭터. 머리는 같고 입력만 다릅니다(`MODE_KEY` 주석).
        */}
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto"
          aria-label={mode === "chat" ? "말로 묻기" : "글로 묻기"}
          aria-pressed={mode === "voice"}
          title={mode === "chat" ? "말로 묻기 (실험)" : "글로 묻기"}
          onClick={toggleMode}
        >
          {mode === "chat" ? (
            <AudioLines className="size-4" />
          ) : (
            <MessageSquareText className="size-4" />
          )}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label={
            theme === "dark" ? `${ASSISTANT} 밝게 보기` : `${ASSISTANT} 어둡게 보기`
          }
          title={theme === "dark" ? "밝게 보기" : "어둡게 보기"}
          onClick={toggleTheme}
        >
          {theme === "dark" ? (
            <Sun className="size-4" />
          ) : (
            <Moon className="size-4" />
          )}
        </Button>
        {turns.length > 0 && (
          <Button
            size="icon"
            variant="ghost"
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

      {/* 음성 모드면 캐릭터가 말풍선 «위»에 섭니다. 말풍선은 두 모드가 같은 것을 씁니다 */}
      {mode === "voice" && <VoiceStage voice={voice} />}

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

      {mode === "voice" ? (
        <VoiceBar voice={voice} disabled={status?.available === false} />
      ) : (
      <div className="shrink-0 border-t p-3">
        {/*
          **`rows` 는 안 먹습니다.** `Textarea` 에 `field-sizing-content` 가
          걸려 있어 내용 높이를 따릅니다 — `rows={2}` 가 적혀 있었지만 실제
          높이는 `min-h-16`(64px)이었습니다. 메모 내용칸이 같은 자리에서
          한 번 걸렸습니다 (`notes-board`).

          높이를 정하는 것은 `min-h` 입니다. 위는 `max-h` 로 막습니다 —
          안 막으면 긴 질문에서 입력칸이 자라 **말풍선 영역을 밀어냅니다**
          (입력 묶음이 `shrink-0` 이라 밀리는 쪽은 대화입니다).
        */}
        <Textarea
          className="max-h-[40vh] min-h-28 overflow-y-auto"
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
      )}
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
