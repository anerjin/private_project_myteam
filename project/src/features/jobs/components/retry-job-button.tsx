"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { retryJobAction } from "@/server/actions/github.actions";

/**
 * 작업 재실행 (`SCR-241`, `DEC-053`).
 *
 * **`DEC-053` 의 재시도가 이것입니다.** BullMQ 의 자동 백오프를 두지 않았으므로
 * 사람이 누릅니다 — 표가 오류 문구를 함께 보여주므로 「눌러도 소용없는
 * 실패」(저장소 삭제)와 「기다리면 되는 실패」(rate limit)를 구별할 수 있습니다.
 *
 * > 전에는 이 버튼에 **핸들러가 없었습니다.** 눌러도 아무 일이 없는 버튼은
 * > 이 저장소가 반복해서 지운 「있는데 안 된다」입니다.
 */
export function RetryJobButton({
  jobId,
  stale = false,
}: {
  jobId: string;
  /**
   * `RUNNING` 인데 오래 멈춰 있는 작업인가.
   * **문구가 달라야 합니다** — 「재실행」은 실패한 것에, 「멈춤 · 다시」는
   * PC 가 꺼져 중단된 것에 맞습니다 (`DEC-053` 의 잃는 것).
   */
  stale?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await retryJobAction(jobId);
          if (!r.ok) {
            toast.error(r.message);
            return;
          }
          /*
           * **「성공했습니다」라고 하지 않습니다.** `runNow` 는 실행을 «시작»할
           * 뿐이고 결과는 행에 남습니다 — 끝났다고 말하면 거짓말입니다.
           */
          toast.success("다시 실행했습니다.", {
            description: "결과는 잠시 뒤 이 표에 반영됩니다.",
          });
          router.refresh();
        })
      }
    >
      <RotateCcw className="size-3.5" />
      {pending ? "실행 중…" : stale ? "멈춤 · 다시" : "재실행"}
    </Button>
  );
}
