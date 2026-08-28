import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  unit,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  icon?: LucideIcon;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-2 p-5">
        <div className="space-y-1">
          <p className="text-muted-foreground text-sm">{label}</p>
          <p className="text-2xl font-semibold tabular-nums">
            {value}
            {unit && (
              <span className="text-muted-foreground ml-1 text-base font-normal">
                {unit}
              </span>
            )}
          </p>
          {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
        </div>
        {Icon && <Icon className="text-muted-foreground size-5 shrink-0" />}
      </CardContent>
    </Card>
  );
}
