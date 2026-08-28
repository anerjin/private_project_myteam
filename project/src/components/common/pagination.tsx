import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * 오프셋 페이지네이션 — **관리 화면 전용** (`DEC-045`).
 *
 * 탐색 화면(자료 목록·검색)은 **커서**를 씁니다. 관리자는 「총 N건 중 2페이지」를
 * 알아야 하고 특정 페이지로 점프하지만, 탐색하는 사람은 흘러가며 볼 뿐입니다.
 *
 * **`Link` 로 만듭니다.** 페이지를 클라이언트 state 로 두면 새로고침·뒤로가기·
 * 링크 공유가 전부 깨집니다 — 목록 상태의 정본은 URL 입니다.
 *
 * > `P8` 의 회원 목록이 이 컴포넌트를 그대로 씁니다. 그래서 도메인을 모릅니다 —
 * > `href` 를 만드는 함수만 받습니다. **소비자 0인 패턴은 검증되지 않은 패턴**이라
 * > `P4` 안에서 감사 로그·관리자 자료·분류가 먼저 씁니다.
 */
export function Pagination({
  page,
  total,
  size,
  hrefFor,
}: {
  page: number;
  total: number;
  size: number;
  hrefFor: (page: number) => string;
}) {
  const last = Math.max(1, Math.ceil(total / size));
  if (last <= 1) return null;

  // 현재 페이지 앞뒤 둘씩 — 1만 건이어도 버튼이 화면을 넘지 않는다
  const from = Math.max(1, page - 2);
  const to = Math.min(last, page + 2);
  const pages = Array.from({ length: to - from + 1 }, (_, i) => from + i);

  return (
    <nav
      className="flex flex-wrap items-center justify-center gap-1 pt-2"
      aria-label="페이지"
    >
      <Button variant="ghost" size="sm" disabled={page <= 1} asChild={page > 1}>
        {page > 1 ? (
          <Link href={hrefFor(page - 1)}>이전</Link>
        ) : (
          <span>이전</span>
        )}
      </Button>

      {from > 1 && (
        <>
          <Button variant="ghost" size="sm" asChild>
            <Link href={hrefFor(1)}>1</Link>
          </Button>
          {from > 2 && <span className="text-muted-foreground px-1">…</span>}
        </>
      )}

      {pages.map((n) => (
        <Button
          key={n}
          variant={n === page ? "secondary" : "ghost"}
          size="sm"
          asChild={n !== page}
          aria-current={n === page ? "page" : undefined}
        >
          {n === page ? <span>{n}</span> : <Link href={hrefFor(n)}>{n}</Link>}
        </Button>
      ))}

      {to < last && (
        <>
          {to < last - 1 && (
            <span className="text-muted-foreground px-1">…</span>
          )}
          <Button variant="ghost" size="sm" asChild>
            <Link href={hrefFor(last)}>{last}</Link>
          </Button>
        </>
      )}

      <Button
        variant="ghost"
        size="sm"
        disabled={page >= last}
        asChild={page < last}
      >
        {page < last ? (
          <Link href={hrefFor(page + 1)}>다음</Link>
        ) : (
          <span>다음</span>
        )}
      </Button>

      <span className="text-muted-foreground ml-2 text-xs tabular-nums">
        총 {total.toLocaleString()}건 · {page}/{last}
      </span>
    </nav>
  );
}
