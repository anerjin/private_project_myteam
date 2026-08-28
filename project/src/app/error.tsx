"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/** SCR-902 오류. 사용자에게 스택·내부 경로를 노출하지 않습니다 (NFR-SEC-016). */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 실제 구현에서는 서버 로거로 보냅니다 (NFR-LOG-004)
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="rounded-full bg-red-100 p-4 text-red-600 dark:bg-red-950 dark:text-red-400">
        <AlertTriangle className="size-7" />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold">일시적인 오류가 발생했습니다</h1>
        <p className="text-muted-foreground max-w-sm text-sm">
          잠시 후 다시 시도해 주세요. 계속 같은 문제가 생기면 관리자에게 알려주세요.
        </p>
        {error.digest && (
          <p className="text-muted-foreground pt-2 font-mono text-xs">
            오류 번호 {error.digest}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button onClick={reset}>
          <RotateCcw className="size-4" />
          다시 시도
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">홈으로</Link>
        </Button>
      </div>
    </div>
  );
}
