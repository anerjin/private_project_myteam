import { getContentType } from "@/features/resources/content-types";
import { cn } from "@/lib/utils";
import type { ResourceType, UsageStatus } from "@/types";

/** 콘텐츠 타입 배지 — 라벨과 색을 레지스트리에서 가져온다 */
export function TypeBadge({ type }: { type: ResourceType }) {
  const meta = getContentType(type);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        meta.badgeClass
      )}
    >
      {meta.label}
    </span>
  );
}

const USAGE_LABEL: Record<UsageStatus, string> = {
  REVIEWING: "검토 중",
  ADOPTED: "사내 사용",
  DEPRECATED: "사용 중단",
};

const USAGE_CLASS: Record<UsageStatus, string> = {
  REVIEWING: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  ADOPTED:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  DEPRECATED:
    "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

export function UsageStatusBadge({ status }: { status: UsageStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        USAGE_CLASS[status]
      )}
    >
      {USAGE_LABEL[status]}
    </span>
  );
}
