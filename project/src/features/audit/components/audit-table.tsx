"use client";

import { ChevronRight } from "lucide-react";
import { Fragment, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { AuditLog } from "@/types";

function DiffPanel({ diff }: { diff: NonNullable<AuditLog["diff"]> }) {
  return (
    <div className="bg-muted/40 space-y-2 rounded-md p-3">
      <p className="text-muted-foreground text-xs">변경 전 · 후</p>
      <div className="space-y-1.5">
        {Object.entries(diff).map(([field, { before, after }]) => (
          <div
            key={field}
            className="grid grid-cols-[8rem_1fr_auto_1fr] items-center gap-2 text-xs"
          >
            <code className="text-muted-foreground truncate">{field}</code>
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700 line-through dark:bg-red-950 dark:text-red-300">
              {before ?? "(없음)"}
            </span>
            <ChevronRight className="text-muted-foreground size-3" />
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              {after ?? "(없음)"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** SCR-251 감사 로그 — 행을 누르면 변경 전·후를 펼친다 */
export function AuditTable({ logs }: { logs: AuditLog[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [via, setVia] = useState("all");

  const filtered = useMemo(
    () =>
      logs.filter((l) => {
        if (via !== "all" && l.via !== via) return false;
        if (!q.trim()) return true;
        const n = q.trim().toLowerCase();
        return (
          l.summary.toLowerCase().includes(n) ||
          l.actorUsername.toLowerCase().includes(n) ||
          l.action.toLowerCase().includes(n)
        );
      }),
    [logs, q, via]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="행위자 · 요약 · 행위 검색"
          className="w-full sm:w-64"
        />
        <Select value={via} onValueChange={setVia}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 경로</SelectItem>
            <SelectItem value="WEB">웹</SelectItem>
            <SelectItem value="MCP">CLI (MCP)</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-muted-foreground ml-auto text-sm">
          {filtered.length}건
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead className="w-40">시각</TableHead>
              <TableHead>행위자</TableHead>
              <TableHead className="w-20">경로</TableHead>
              <TableHead>행위</TableHead>
              <TableHead>요약</TableHead>
              <TableHead className="w-32">IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((l) => {
              const expandable = !!l.diff;
              const expanded = open === l.id;
              return (
                <Fragment key={l.id}>
                  <TableRow
                    className={cn(expandable && "cursor-pointer")}
                    onClick={() =>
                      expandable && setOpen(expanded ? null : l.id)
                    }
                  >
                    <TableCell>
                      {expandable && (
                        <ChevronRight
                          className={cn(
                            "text-muted-foreground size-4 transition-transform",
                            expanded && "rotate-90"
                          )}
                          aria-hidden
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs tabular-nums">
                      {l.createdAt.slice(0, 16).replace("T", " ")}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      @{l.actorUsername}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={l.via === "MCP" ? "default" : "secondary"}
                      >
                        {l.via}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {l.action}
                    </TableCell>
                    <TableCell className="text-sm">{l.summary}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {l.ip}
                    </TableCell>
                  </TableRow>
                  {expanded && l.diff && (
                    <TableRow>
                      <TableCell colSpan={7} className="p-3">
                        <DiffPanel diff={l.diff} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-muted-foreground text-xs">
        변경 전·후가 기록된 행만 펼칠 수 있습니다. 보존 기간 1년.
      </p>
    </div>
  );
}
