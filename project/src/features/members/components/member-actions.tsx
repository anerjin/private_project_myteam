"use client";

import {
  KeyRound,
  MoreHorizontal,
  RotateCcw,
  ShieldAlert,
  UserMinus,
  UserX,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ReasonDialog } from "@/features/members/components/reason-dialog";
import { canAttempt, type MemberStatus } from "@/features/members/schema";
import {
  reactivateMemberAction,
  resetMemberPasswordAction,
  revokeMemberKeysAction,
  suspendMemberAction,
  withdrawMemberAction,
} from "@/server/actions/member.actions";

/**
 * SCR-212 회원 상세의 처리 버튼 (`FR-ADM-003`).
 *
 * ## 이 자리에 **`onClick` 없는 버튼 다섯 개**가 있었습니다
 *
 * `P3` 는 그것을 **지웠습니다** — 「있는데 안 된다」보다 없는 편이 정직하기
 * 때문입니다. 여기서 되돌려 놓으면서 **배선과 함께** 넣습니다.
 *
 * ## 화면은 «정적» 판정만 합니다
 *
 * 「`SUSPEND` 는 `ACTIVE` 에서만」은 `TRANSITION_FROM` 한 벌을 봅니다
 * (`DEC-045`). 「이 계정이 마지막 하나인가」·「방금 다른 창에서 처리했는가」는
 * **화면이 알 수 없고 흉내내면 틀립니다** — 서버가 `LAST_ACTIVE_ACCOUNT` 로
 * 답하고 그 문구를 그대로 띄웁니다.
 *
 * ## 되돌릴 수 없는 것은 사유를 받습니다
 *
 * 정지와 강제 탈퇴는 `ReasonDialog` 를 지납니다. 탈퇴는 **되돌리는 전이가
 * 아예 없어서**(`REJECT` 에는 `REOPEN` 이 있습니다) 문구로 그 사실을 말합니다.
 */

type Kind = "SUSPEND" | "WITHDRAW";

const DIALOG: Record<
  Kind,
  { title: string; confirmLabel: string; hint: string; destructive?: boolean }
> = {
  SUSPEND: {
    title: "회원 정지",
    confirmLabel: "정지",
    hint: "정지 즉시 모든 세션이 끊기고 API 키도 무효가 됩니다. 사유는 본인에게 전달되지 않고 감사 로그와 관리 화면에만 남습니다.",
  },
  WITHDRAW: {
    title: "강제 탈퇴",
    confirmLabel: "탈퇴 처리",
    hint: "되돌릴 수 없습니다. 아이디는 다시 쓸 수 없게 남고, 등록한 자료와 감사 로그는 그대로 보존됩니다.",
    destructive: true,
  },
};

export function MemberActions({
  member,
}: {
  member: {
    id: string;
    name: string;
    username: string;
    status: MemberStatus;
    activeKeys: number;
  };
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [dialog, setDialog] = useState<Kind | null>(null);

  /** 액션 하나를 돌리고 결과를 알린다 — 여섯 곳에 같은 코드를 두지 않는다 */
  function run(
    fn: () => Promise<{ ok: boolean; message?: string }>,
    done: string
  ) {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.message ?? "처리하지 못했습니다.");
        return;
      }
      toast.success(done);
      router.refresh();
    });
  }

  async function confirmReason(reason: string) {
    const kind = dialog;
    if (!kind) return;
    setDialog(null);
    if (kind === "SUSPEND") {
      run(
        () => suspendMemberAction({ id: member.id, reason }),
        `${member.name} 님을 정지했습니다.`
      );
    } else {
      run(
        () => withdrawMemberAction({ id: member.id, reason }),
        `${member.name} 님을 탈퇴 처리했습니다.`
      );
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {canAttempt("SUSPEND", member.status) && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => setDialog("SUSPEND")}
          >
            <ShieldAlert className="size-4" />
            정지
          </Button>
        )}

        {canAttempt("REACTIVATE", member.status) && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              run(
                () => reactivateMemberAction(member.id),
                `${member.name} 님의 정지를 해제했습니다.`
              )
            }
          >
            <RotateCcw className="size-4" />
            정지 해제
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={busy}>
              <MoreHorizontal className="size-4" />더 보기
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {/*
              🔄 여기 **역할 바꾸기**(`DropdownMenuRadioGroup`)가 있었습니다.
                 `DEC-077` 로 등급이 사라져 통째로 지웠습니다 — 바꿀 값이 없습니다.
            */}
            <DropdownMenuItem
              disabled={member.activeKeys === 0}
              onSelect={() =>
                run(
                  () => revokeMemberKeysAction(member.id),
                  `${member.name} 님의 API 키를 폐기했습니다.`
                )
              }
            >
              <KeyRound className="size-4" />
              API 키 전체 폐기
              {/* **왜 못 누르는지** 말합니다 — 회색 항목만 두면 고장으로 보입니다 */}
              <span className="text-muted-foreground ml-auto text-xs">
                {member.activeKeys === 0 ? "없음" : `${member.activeKeys}개`}
              </span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onSelect={() =>
                startTransition(async () => {
                  const r = await resetMemberPasswordAction(member.id);
                  if (!r.ok) {
                    toast.error(r.message ?? "처리하지 못했습니다.");
                    return;
                  }
                  /*
                   * **메일을 보내지 않으므로**(`DEC-015`) 관리자가 직접
                   * 전달합니다. 토스트가 사라지면 다시 볼 수 없어 길게 띄웁니다.
                   */
                  toast.success(`임시 비밀번호: ${r.data.temporaryPassword}`, {
                    description: `@${r.data.username} 님에게 직접 전달하세요. 이 화면을 벗어나면 다시 볼 수 없습니다.`,
                    duration: 60_000,
                  });
                  router.refresh();
                })
              }
            >
              <UserMinus className="size-4" />
              비밀번호 초기화
            </DropdownMenuItem>

            {canAttempt("WITHDRAW", member.status) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setDialog("WITHDRAW")}
                >
                  <UserX className="size-4" />
                  강제 탈퇴
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {dialog && (
        <ReasonDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          target={`${member.name} (@${member.username})`}
          onConfirm={confirmReason}
          {...DIALOG[dialog]}
        />
      )}
    </>
  );
}
