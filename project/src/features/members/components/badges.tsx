import { Badge } from "@/components/ui/badge";
import { ROLE_LABEL, USER_STATUS_LABEL } from "@/config/site";
import { cn } from "@/lib/utils";
import type { Role, UserStatus } from "@/types";

const USER_STATUS_CLASS: Record<UserStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  ACTIVE:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  SUSPENDED: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  WITHDRAWN: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
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

export function RoleBadge({ role }: { role: Role }) {
  return (
    <Badge variant={role === "ADMIN" ? "default" : "secondary"}>
      {ROLE_LABEL[role]}
    </Badge>
  );
}
