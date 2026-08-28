import { ShieldX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "접근 권한 없음" };

/** SCR-901 접근 권한 없음 */
export default function ForbiddenPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="bg-muted text-muted-foreground rounded-full p-4">
        <ShieldX className="size-7" />
      </div>
      <div className="space-y-1.5">
        <p className="text-muted-foreground text-sm font-medium tabular-nums">
          403
        </p>
        <h1 className="text-xl font-semibold">
          이 화면에 접근할 권한이 없습니다
        </h1>
        <p className="text-muted-foreground max-w-sm text-sm">
          관리자 영역은 <b>ADMIN</b> 역할만 볼 수 있습니다. 권한이 필요하면
          관리자에게 요청하세요.
        </p>
      </div>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/dashboard">홈으로</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/resources">자료 둘러보기</Link>
        </Button>
      </div>
    </div>
  );
}
