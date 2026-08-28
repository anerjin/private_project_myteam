import type { ReactNode } from "react";

/**
 * 본문 맨 위 줄. 설명 · 건수 · 액션 버튼을 담습니다.
 *
 * **타이틀은 헤더의 빵부스러기가 담당합니다** (`components/common/breadcrumbs.tsx`).
 * `title` 은 아직 옮기지 않은 **관리자 영역 전용**이며, 관리자까지 옮기면 제거합니다.
 */
export function PageHeader({
  title,
  description,
  count,
  action,
}: {
  title?: string;
  description?: string;
  count?: number;
  action?: ReactNode;
}) {
  // 타이틀이 없으면 붙일 곳이 없으므로 건수를 설명과 한 줄로 합친다
  const subtitle = title
    ? description
    : [description, count !== undefined ? `${count}건` : null]
        .filter(Boolean)
        .join(" · ");

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        {title && (
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {count !== undefined && (
              <span className="text-muted-foreground text-sm">{count}건</span>
            )}
          </div>
        )}
        {subtitle && (
          <p className="text-muted-foreground text-sm">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}
