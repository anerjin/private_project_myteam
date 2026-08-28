import { Clock, RefreshCw } from "lucide-react";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { refreshPendingAction } from "@/server/actions/auth.actions";
import { requirePendingUser } from "@/server/auth/guards";
import { getProfile } from "@/server/services/user.service";

export const metadata: Metadata = { title: "승인 대기" };

/** SCR-003 승인 대기 */
export default async function PendingPage() {
  // `PENDING` 은 유효한 세션이다 (DEC-040). 승인되면 여기서 /dashboard 로 나간다.
  const session = await requirePendingUser();
  const profile = await getProfile(session.userId);

  const appliedAt = profile.createdAt.toLocaleString("ko-KR", {
    dateStyle: "long",
    timeStyle: "short",
  });

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardContent className="flex flex-col items-center gap-5 p-8 text-center">
        <div className="rounded-full bg-amber-100 p-4 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
          <Clock className="size-7" />
        </div>

        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold">
            관리자 승인을 기다리고 있습니다
          </h1>
          <p className="text-muted-foreground text-sm">
            메일로 알려드리지 않습니다. 아래 버튼으로 직접 확인해 주세요.
          </p>
        </div>

        <dl className="bg-muted/50 grid w-full grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg p-4 text-left text-sm">
          <dt className="text-muted-foreground">아이디</dt>
          <dd className="font-medium">{profile.username}</dd>
          <dt className="text-muted-foreground">신청 일시</dt>
          <dd>{appliedAt}</dd>
          <dt className="text-muted-foreground">소속</dt>
          <dd>{profile.department ?? "-"}</dd>
        </dl>

        <div className="flex w-full gap-2">
          <form action={refreshPendingAction} className="flex-1">
            <Button type="submit" className="w-full">
              <RefreshCw className="size-4" />
              상태 새로고침
            </Button>
          </form>
          <SignOutButton />
        </div>
      </CardContent>
    </Card>
  );
}
