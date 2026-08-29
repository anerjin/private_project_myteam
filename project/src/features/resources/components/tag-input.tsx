"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { suggestTagsAction } from "@/server/actions/taxonomy.actions";

/**
 * 태그 입력 + 자동완성 (`FR-SRCH-007`).
 *
 * ## `<datalist>` 로는 안 됩니다
 *
 * 태그 칸은 **쉼표로 구분된 한 줄**이라 브라우저의 `<datalist>` 는 칸 전체를
 * 후보와 비교합니다 — `ai, ra` 를 치면 그 문자열 전체로 찾습니다.
 * 그래서 **마지막 조각만** 보고 후보를 냅니다.
 *
 * ## 왜 필요한가
 *
 * `rag`·`RAG`·`retrieval-augmented` 가 따로 생기면 태그로 찾는 일이 안 됩니다.
 * 관리 화면의 병합(`FR-ADM-013`)은 **이미 갈라진 뒤**의 수습이고, 이쪽이
 * 갈라지지 않게 하는 앞단입니다.
 *
 * ## 폼과의 계약은 **숨은 `input` 하나**입니다
 *
 * 이 폼은 `FormData` 로 제출됩니다(`resource-form`). 그래서 화면이 어떻게
 * 생겼든 **`name="tags"` 한 칸에 쉼표 문자열**이 실려야 합니다 —
 * `P5` 에서 폼 다섯 개가 `name` 없이 조용히 아무것도 안 보내던 그 자리입니다.
 */

/** 이 글자 수부터 후보를 찾습니다 — 한 글자면 거의 전부가 걸립니다 */
const MIN_QUERY = 1;

function parse(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function TagInput({
  name = "tags",
  defaultValue = "",
  placeholder = "쉼표로 구분 · 3~5개 권장",
  id,
}: {
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  id?: string;
}) {
  const [tags, setTags] = useState<string[]>(() => parse(defaultValue));
  const [draft, setDraft] = useState("");
  const [options, setOptions] = useState<{ slug: string; count: number }[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  /*
   * **입력이 멈추면 찾습니다.** 글자마다 서버 액션을 부르면 「rag」 세 글자에
   * 세 번 갑니다. 200ms 는 사람이 다음 글자를 치는 간격보다 짧아
   * 기다린다는 느낌을 주지 않습니다.
   */
  useEffect(() => {
    const term = draft.trim();
    /*
     * **비우는 것도 타이머 «안»에서 합니다.** 이펙트 본문에서 곧바로
     * `setState` 를 부르면 `react-hooks/set-state-in-effect` 가 잡습니다 —
     * 렌더 직후 한 번 더 렌더하게 만드는 형태라 그렇습니다.
     */
    const timer = setTimeout(async () => {
      if (term.length < MIN_QUERY) {
        setOptions([]);
        setOpen(false);
        return;
      }
      const r = await suggestTagsAction({ q: term, exclude: tags });
      if (r.ok) {
        setOptions(r.data.map((t) => ({ slug: t.slug, count: t.count })));
        setOpen(r.data.length > 0);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [draft, tags]);

  // 바깥을 누르면 후보를 닫는다
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function add(tag: string) {
    const t = tag.trim();
    if (!t) return;
    // 중복은 조용히 무시합니다 — 「이미 있습니다」는 알 필요가 없는 사실입니다
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setDraft("");
    setOptions([]);
    setOpen(false);
  }

  function remove(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  return (
    <div ref={boxRef} className="relative space-y-2">
      {/*
        **폼이 실제로 보내는 값.** 화면은 배지로 보이지만 제출되는 것은
        이 한 칸입니다 — `name` 이 없으면 오류 없이 사라집니다.
      */}
      <input type="hidden" name={name} value={tags.join(", ")} />

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <Badge key={t} variant="secondary" className="gap-1">
              {t}
              <button
                type="button"
                aria-label={`${t} 제거`}
                className="hover:text-destructive"
                onClick={() => remove(t)}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <Input
        id={id}
        value={draft}
        placeholder={tags.length === 0 ? placeholder : "태그 추가"}
        autoComplete="off"
        onChange={(e) => {
          const v = e.target.value;
          /*
           * **쉼표를 치면 확정합니다.** 붙여넣기로 `a, b, c` 가 한 번에
           * 들어오는 경우도 같은 자리에서 처리됩니다.
           */
          if (v.includes(",")) {
            const parts = parse(v);
            const last = v.trimEnd().endsWith(",") ? "" : (parts.pop() ?? "");
            for (const p of parts) add(p);
            setDraft(last);
            return;
          }
          setDraft(v);
        }}
        onFocus={() => setOpen(options.length > 0)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            // **폼을 제출하지 않습니다** — 태그를 확정하려던 것뿐입니다
            e.preventDefault();
            add(draft);
            return;
          }
          if (e.key === "Backspace" && draft === "" && tags.length > 0) {
            setTags((prev) => prev.slice(0, -1));
          }
        }}
      />

      {open && options.length > 0 && (
        <ul className="bg-popover absolute z-20 max-h-56 w-full overflow-y-auto rounded-md border p-1 shadow-md">
          {options.map((o) => (
            <li key={o.slug}>
              <button
                type="button"
                className="hover:bg-accent flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm"
                onClick={() => add(o.slug)}
              >
                <span>#{o.slug}</span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {o.count}건
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-muted-foreground text-xs">
        새로 만들기 전에 이미 있는 태그를 먼저 보세요. 비슷한 태그가 갈라지면
        태그로 찾는 일이 안 됩니다.
      </p>
    </div>
  );
}
