import { FileQuestion } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "찾을 수 없음" };

/** SCR-902 404 */
export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="bg-muted text-muted-foreground rounded-full p-4">
        <FileQuestion className="size-7" />
      </div>
      <div className="space-y-1.5">
        <p className="text-muted-foreground text-sm font-medium tabular-nums">404</p>
        <h1 className="text-xl font-semibold">찾는 화면이 없습니다</h1>
        <p className="text-muted-foreground max-w-sm text-sm">
          주소가 바뀌었거나 자료가 삭제되었을 수 있습니다. 삭제된 자료는 관리자
          휴지통에서 30일간 복구할 수 있습니다.
        </p>
      </div>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/dashboard">홈으로</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/search">검색하기</Link>
        </Button>
      </div>
    </div>
  );
}
