"use client";

import {
  Bold,
  Code,
  Columns2,
  Eye,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  PenLine,
  Quote,
  Table,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { MarkdownViewer } from "@/components/common/markdown-viewer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * 마크다운 입력기 — **툴바 + 실시간 미리보기.**
 *
 * ## 왜 «진짜» 위지윅이 아닌가
 *
 * 렌더된 글을 직접 고치는 편집기(TipTap·Milkdown 류)는 ProseMirror 를 끌고
 * 오고 패키지가 대여섯입니다. 그것보다 무거운 문제는 **마크다운 렌더러가 두
 * 벌**이 된다는 것입니다 — 우리는 `rehype-sanitize` 를 지나는 뷰어 하나로
 * XSS 를 막고 있는데(`NFR-SEC-007`), 그런 편집기는 자기 렌더러와 자기 CSS
 * 테마를 들고 옵니다. 이 저장소가 반복해서 지워 온 「같은 사실이 두 곳에」입니다.
 *
 * 그리고 **왕복이 손실됩니다.** 마크다운 → 편집기 모델 → 마크다운을 지나면
 * 사람이 쓴 표 정렬이나 줄바꿈이 조용히 달라집니다. 여기서는 **사람이 친
 * 글자가 그대로 저장되는 값**입니다.
 *
 * 대신 위지윅이 주는 것을 다른 방법으로 줍니다 — 서식 단추, 단축키,
 * 그리고 **옆에서 즉시 그려지는 결과**. 미리보기는 자료 본문과 **같은
 * 뷰어**라, 여기서 보이는 것이 저장 뒤에도 그대로입니다.
 *
 * ## 선택 영역을 살려서 넣습니다
 *
 * 단추가 글자만 덧붙이면 「굵게」를 누를 때마다 커서가 끝으로 튑니다.
 * 고른 글자를 감싸고, **감싼 뒤의 커서 자리까지** 되돌려 놓습니다.
 */

type Mode = "write" | "split" | "preview";

interface Insertion {
  value: string;
  /** 넣은 뒤 커서를 둘 자리 — `[start, end]` */
  select: [number, number];
}

/** 고른 글자를 앞뒤로 감싼다. 고른 게 없으면 자리표시자를 넣고 그것을 고른다 */
function wrapSelection(
  text: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder: string
): Insertion {
  const picked = text.slice(start, end) || placeholder;
  const value = text.slice(0, start) + before + picked + after + text.slice(end);
  const from = start + before.length;
  return { value, select: [from, from + picked.length] };
}

/**
 * 고른 줄들 앞에 표시를 붙이거나 뗀다.
 *
 * **이미 붙어 있으면 뗍니다.** 안 그러면 「목록」을 두 번 누른 사람이
 * `- - 항목` 을 얻습니다.
 */
function toggleLinePrefix(
  text: string,
  start: number,
  end: number,
  prefix: string
): Insertion {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = text.indexOf("\n", end);
  const stop = lineEnd === -1 ? text.length : lineEnd;
  const block = text.slice(lineStart, stop);

  const lines = block.split("\n");
  const all = lines.every((l) => l.startsWith(prefix));
  const next = lines
    .map((l) => (all ? l.slice(prefix.length) : prefix + l))
    .join("\n");

  return {
    value: text.slice(0, lineStart) + next + text.slice(stop),
    select: [lineStart, lineStart + next.length],
  };
}

const TABLE = `| 항목 | 값 |\n| --- | --- |\n|  |  |`;

/**
 * 도구는 **데이터**입니다.
 *
 * 처음에는 `wrap("**","**","굵게")` 처럼 함수를 만들어 넣었는데, React
 * Compiler 가 **「렌더 중에 ref 를 읽는다」**고 잡았습니다 — 커링된 화살표가
 * 언제 불릴지 컴파일러가 알 수 없어서입니다. 맞는 지적입니다.
 *
 * 무엇을 할지는 여기 «값»으로 적고, **실행은 이벤트 핸들러 한 곳**에서만
 * 합니다. ref 를 만지는 자리가 하나로 모입니다.
 */
type Tool = { icon: typeof Bold; label: string; hint?: string } & (
  | { kind: "wrap"; before: string; after: string; placeholder: string }
  | { kind: "prefix"; prefix: string }
  | { kind: "table" }
);

const TOOLS: Tool[] = [
  { kind: "wrap", icon: Bold, label: "굵게", hint: "Ctrl+B", before: "**", after: "**", placeholder: "굵게" },
  { kind: "wrap", icon: Italic, label: "기울임", hint: "Ctrl+I", before: "*", after: "*", placeholder: "기울임" },
  { kind: "prefix", icon: Heading2, label: "제목", prefix: "## " },
  { kind: "prefix", icon: List, label: "목록", prefix: "- " },
  { kind: "prefix", icon: ListOrdered, label: "번호 목록", prefix: "1. " },
  { kind: "prefix", icon: Quote, label: "인용", prefix: "> " },
  { kind: "wrap", icon: Code, label: "코드", before: "`", after: "`", placeholder: "코드" },
  { kind: "wrap", icon: Link2, label: "링크", hint: "Ctrl+K", before: "[", after: "](https://)", placeholder: "링크 글자" },
  { kind: "table", icon: Table, label: "표" },
];

/** 단축키 → 위 배열의 자리 */
const SHORTCUTS: Record<string, number> = { b: 0, i: 1, k: 7 };

export function MarkdownEditor({
  value,
  onChange,
  label,
  placeholder = "마크다운으로 씁니다. 표와 목록이 그대로 그려집니다.",
  maxLength,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  /** `aria-label` — 폼 안에서 이 칸이 무엇인지 */
  label: string;
  placeholder?: string;
  maxLength?: number;
  className?: string;
}) {
  const [mode, setMode] = useState<Mode>("split");
  const ref = useRef<HTMLTextAreaElement>(null);
  /** 값이 바뀐 «뒤»에 돌려놓을 커서 자리 */
  const pending = useRef<[number, number] | null>(null);

  /*
   * **커서를 DOM 에 직접 돌려놓습니다.** 값이 바뀌면 React 가 `textarea` 를
   * 다시 그리고 커서는 끝으로 갑니다 — 서식 단추를 누를 때마다 글 끝으로
   * 튀는 그 현상입니다. 이건 상태가 아니라 «바깥 시스템(DOM)»을 맞추는
   * 일이라 이펙트가 맞는 자리입니다.
   */
  useEffect(() => {
    const sel = pending.current;
    if (!sel || !ref.current) return;
    pending.current = null;
    ref.current.focus();
    ref.current.setSelectionRange(sel[0], sel[1]);
  }, [value]);

  /** **ref 를 만지는 유일한 자리.** 이벤트 핸들러에서만 불립니다 */
  function run(tool: Tool) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;

    let made: Insertion;
    if (tool.kind === "wrap") {
      made = wrapSelection(
        value,
        start,
        end,
        tool.before,
        tool.after,
        tool.placeholder
      );
    } else if (tool.kind === "prefix") {
      made = toggleLinePrefix(value, start, end, tool.prefix);
    } else {
      // 줄 한가운데면 줄을 바꾸고 넣습니다 — 표는 줄 처음에서만 표입니다
      const atLineStart = start === 0 || value[start - 1] === "\n";
      const body = (atLineStart ? "" : "\n") + TABLE + "\n";
      const at = start + body.length;
      made = {
        value: value.slice(0, start) + body + value.slice(start),
        select: [at, at],
      };
    }

    if (maxLength !== undefined && made.value.length > maxLength) return;
    pending.current = made.select;
    onChange(made.value);
  }

  const MODES: { k: Mode; label: string; icon: typeof PenLine }[] = [
    { k: "write", label: "쓰기", icon: PenLine },
    { k: "split", label: "나란히", icon: Columns2 },
    { k: "preview", label: "미리보기", icon: Eye },
  ];

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-1 rounded-md border p-1">
        {TOOLS.map((t) => (
          <Button
            key={t.label}
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={t.label}
            title={t.hint ? `${t.label} (${t.hint})` : t.label}
            // 단추를 누를 때 입력칸의 선택이 풀리지 않게 합니다
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(t)}
          >
            <t.icon className="size-4" />
          </Button>
        ))}

        <span className="ml-auto flex gap-1">
          {MODES.map((m) => (
            <Button
              key={m.k}
              type="button"
              size="sm"
              variant={mode === m.k ? "outline" : "ghost"}
              aria-pressed={mode === m.k}
              onClick={() => setMode(m.k)}
            >
              <m.icon className="size-4" />
              <span className="hidden sm:inline">{m.label}</span>
            </Button>
          ))}
        </span>
      </div>

      <div
        className={cn(
          "grid gap-3",
          mode === "split" ? "lg:grid-cols-2" : "grid-cols-1"
        )}
      >
        {mode !== "preview" && (
          <Textarea
            ref={ref}
            aria-label={label}
            className="max-h-[60vh] min-h-96 overflow-y-auto font-mono text-sm"
            value={value}
            maxLength={maxLength}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (!e.ctrlKey && !e.metaKey) return;
              const hit = SHORTCUTS[e.key.toLowerCase()];
              if (hit === undefined) return;
              e.preventDefault();
              run(TOOLS[hit]!);
            }}
          />
        )}

        {mode !== "write" && (
          /*
            **자료 본문과 «같은» 뷰어입니다.** 여기서 보이는 것이 저장 뒤에도
            그대로여야 하고, 미리보기용 렌더러를 따로 두면 그 약속이 깨집니다.
          */
          <div className="max-h-[60vh] min-h-96 overflow-y-auto rounded-lg border px-3 py-2">
            {value.trim() ? (
              <MarkdownViewer content={value} />
            ) : (
              <p className="text-muted-foreground text-sm">
                왼쪽에 쓰면 여기에 그려집니다.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
