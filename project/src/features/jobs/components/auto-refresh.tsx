"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const INTERVAL_MS = 10_000;

/** SCR-241 작업 모니터 — 10초 간격 자동 갱신 (토글 가능) */
export function AutoRefresh() {
  const router = useRouter();
  const [on, setOn] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => {
      router.refresh();
      setTick((n) => n + 1);
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [on, router]);

  return (
    <div className="flex items-center gap-3">
      {on && tick > 0 && (
        <span className="text-muted-foreground text-xs tabular-nums">
          {tick}회 갱신됨
        </span>
      )}
      <div className="flex items-center gap-2 text-sm">
        <Switch id="job-auto-refresh" checked={on} onCheckedChange={setOn} />
        <Label htmlFor="job-auto-refresh" className="text-muted-foreground">
          10초 자동 갱신
        </Label>
      </div>
      <Button variant="outline" size="sm" onClick={() => router.refresh()}>
        <RefreshCw className="size-4" />
        지금 새로고침
      </Button>
    </div>
  );
}
