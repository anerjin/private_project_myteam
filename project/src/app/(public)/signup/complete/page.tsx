import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "가입 신청 완료" };

const STEPS = [
  { done: true, title: "가입 신청", desc: "방금 접수되었습니다" },
  { done: false, title: "관리자 승인", desc: "영업일 기준 1일 이내 처리" },
  { done: false, title: "이용 시작", desc: "승인 후 로그인하면 바로 이용" },
];

/** SCR-002-1 가입 신청 완료 */
export default function SignupCompletePage() {
  return (
    <Card className="mx-auto w-full max-w-md">
      <CardContent className="flex flex-col items-center gap-6 p-8 text-center">
        <div className="rounded-full bg-emerald-100 p-4 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
          <CheckCircle2 className="size-7" />
        </div>

        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold">가입 신청이 접수되었습니다</h1>
          <p className="text-muted-foreground text-sm">
            관리자가 승인하면 바로 이용할 수 있습니다.
          </p>
        </div>

        <ol className="w-full space-y-3 text-left">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex items-start gap-3">
              <span
                className={
                  s.done
                    ? "bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium"
                    : "bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium"
                }
              >
                {i + 1}
              </span>
              <div className="space-y-0.5">
                <p className="text-sm font-medium">{s.title}</p>
                <p className="text-muted-foreground text-xs">{s.desc}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="bg-muted/50 w-full rounded-lg p-4 text-left text-xs">
          <p className="mb-1 font-medium">알아두실 점</p>
          <ul className="text-muted-foreground list-inside list-disc space-y-1">
            <li>승인 결과는 메일로 보내지 않습니다. 로그인해서 확인해 주세요.</li>
            <li>승인 전에 로그인하면 «승인 대기» 화면이 나타납니다.</li>
          </ul>
        </div>

        <div className="flex w-full gap-2">
          <Button className="flex-1" asChild>
            <Link href="/login">로그인 화면으로</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/pending">상태 확인</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
