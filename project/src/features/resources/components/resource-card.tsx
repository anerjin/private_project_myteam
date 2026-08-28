import { Bookmark, Eye } from "lucide-react";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { TypeBadge } from "@/features/resources/components/badges";
import { getContentType } from "@/features/resources/content-types";
import { cn } from "@/lib/utils";
import type { Resource } from "@/types";

function relativeDate(iso: string) {
  const days = Math.floor(
    (Date.parse("2026-08-28T03:00:00Z") - Date.parse(iso)) / 86_400_000
  );
  if (days <= 0) return "오늘";
  if (days < 7) return `${days}일 전`;
  return iso.slice(0, 10).replace(/-/g, ". ");
}

export function ResourceCard({ resource }: { resource: Resource }) {
  const meta = getContentType(resource.type);
  const TypeFooter = meta.Card;
  const href = `/resources/${meta.slug}/${resource.slug}`;

  return (
    <Card className="hover:border-primary/40 group transition-colors">
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <div className="flex items-start gap-2">
          <TypeBadge type={resource.type} />
          <Bookmark
            className={cn(
              "ml-auto size-4 shrink-0",
              resource.bookmarked
                ? "fill-amber-400 text-amber-500"
                : "text-muted-foreground"
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Link href={href} className="block">
            <h3 className="group-hover:text-primary line-clamp-2 leading-snug font-medium">
              {resource.title}
            </h3>
          </Link>
          {resource.summary && (
            <p className="text-muted-foreground line-clamp-2 text-sm">
              {resource.summary}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-1">
          {resource.tags.map((t) => (
            <span
              key={t}
              className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[11px]"
            >
              #{t}
            </span>
          ))}
        </div>

        <div className="text-muted-foreground mt-auto space-y-2 border-t pt-3 text-xs">
          {/* 타입별 한 줄 — 레지스트리가 제공한다 */}
          <TypeFooter resource={resource} />
          <div className="flex items-center gap-3">
            <span>{resource.author.name}</span>
            <span>{relativeDate(resource.createdAt)}</span>
            <span className="inline-flex items-center gap-1">
              <Eye className="size-3" />
              {resource.viewCount}
            </span>
            {resource.sourceChannel === "MCP" && (
              <span className="ml-auto font-mono text-[10px]">CLI</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
