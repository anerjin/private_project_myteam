import { Star } from "lucide-react";

import type { Resource } from "@/types";

export function Card({ resource }: { resource: Resource }) {
  const d = resource.detail;
  if (d.type !== "GITHUB_REPO") return null;

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="inline-flex items-center gap-1">
        <Star className="size-3" />
        {d.stars?.toLocaleString() ?? "-"}
      </span>
      {d.primaryLanguage && <span>{d.primaryLanguage}</span>}
      {d.license && <span>{d.license}</span>}
      {d.archiveStatus === "DONE" && (
        <span className="text-emerald-600 dark:text-emerald-400">
          아카이브 보관됨
        </span>
      )}
      {d.isGone && <span className="text-destructive">원본 소실</span>}
    </span>
  );
}
