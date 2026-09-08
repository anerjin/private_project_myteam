import { USER_STATUS_LABEL } from "@/config/site";
import { cn } from "@/lib/utils";
import type { UserStatus } from "@/types";

const USER_STATUS_CLASS: Record<UserStatus, string> = {
  ACTIVE:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  SUSPENDED: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  WITHDRAWN:
    "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

export function UserStatusBadge({ status }: { status: UserStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        USER_STATUS_CLASS[status]
      )}
    >
      {USER_STATUS_LABEL[status]}
    </span>
  );
}

/*
 * `RoleBadge` 가 여기 있었습니다. **지웠습니다** (`DEC-077`) —
 * 모두가 같은 하나이면 배지는 아무것도 구분하지 않습니다.
 */
