"use client";

import { Bookmark, Check, Share2 } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  countViewAction,
  toggleBookmarkAction,
} from "@/server/actions/resource.actions";

/**
 * 자료 상세의 동작 묶음 (`FR-COLL-001` 북마크 · `FR-RES-014` 조회수).
 *
 * ## 조회수를 **렌더 중에 세지 않습니다**
 *
 * 서버 컴포넌트는 프리페치·재검증으로 여러 번 실행될 수 있어 숫자가 부풀고,
 * 렌더 중 쓰기는 캐시와도 싸웁니다. **본 뒤에** 액션으로 한 번 부릅니다.
 * `ref` 로 막는 이유는 개발 모드의 StrictMode 이중 실행 때문입니다 —
 * 그것 때문에 조회수가 두 배가 되면 「버그가 아니라 개발 모드」라고 설명해야 합니다.
 */
export function ResourceActions({
  resourceId,
  bookmarked: initial,
  bookmarkCount: initialCount,
}: {
  resourceId: string;
  bookmarked: boolean;
  bookmarkCount: number;
}) {
  const [bookmarked, setBookmarked] = useState(initial);
  const [count, setCount] = useState(initialCount);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const counted = useRef(false);

  useEffect(() => {
    if (counted.current) return;
    counted.current = true;
    void countViewAction(resourceId);
  }, [resourceId]);

  function toggle() {
    startTransition(async () => {
      const r = await toggleBookmarkAction(resourceId);
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      // 서버가 «센» 값을 그대로 쓴다 — 화면이 증감을 계산하면 정본과 갈라진다
      setBookmarked(r.data.bookmarked);
      setCount(r.data.bookmarkCount);
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("링크를 복사하지 못했습니다.");
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" disabled={pending} onClick={toggle}>
        <Bookmark
          className={
            bookmarked ? "size-4 fill-amber-400 text-amber-500" : "size-4"
          }
        />
        북마크
        {count > 0 && (
          <span className="text-muted-foreground tabular-nums">{count}</span>
        )}
      </Button>
      <Button variant="outline" size="sm" onClick={copyLink}>
        {copied ? <Check className="size-4" /> : <Share2 className="size-4" />}
        {copied ? "복사했습니다" : "링크 복사"}
      </Button>
    </>
  );
}
