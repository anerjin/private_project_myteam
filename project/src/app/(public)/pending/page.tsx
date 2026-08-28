import { Clock, RefreshCw } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "승인 대기" };

/** SCR-003 승인 대기 */
export default function PendingPage() {
  return (
    <Card className="mx-auto w-full max-w-md">
      <CardContent className="flex flex-col items-center gap-5 p-8 text-center">
        <div className="rounded-full bg-amber-100 p-4 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
          <Clock className="size-7" />
        </div>

        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold">관리자 승인을 기다리고 있습니다</h1>
          <p className="text-muted-foreground text-sm">
            승인되면 이 화면에서 바로 이용할 수 있습니다.
            <br />
            아래 버튼으로 상태를 확인하세요.
          </p>
        </div>

        <dl className="bg-muted/50 grid w-full grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg p-4 text-left text-sm">
          <dt className="text-muted-foreground">아이디</dt>
          <dd className="font-medium">taeyang</dd>
          <dt className="text-muted-foreground">신청 일시</dt>
          <dd>2026. 08. 28. 09:15</dd>
          <dt className="text-muted-foreground">소속</dt>
          <dd>개발팀</dd>
        </dl>

        <div className="flex w-full gap-2">
          <Button className="flex-1">
            <RefreshCw className="size-4" />
            상태 새로고침
          </Button>
          <Button variant="outline" asChild>
            <Link href="/login">로그아웃</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
