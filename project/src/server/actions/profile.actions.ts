"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { guard, ok, validationError, type ActionResult } from "@/lib/result";
import { requireActor } from "@/server/auth/guards";
import { verifyPassword } from "@/server/auth/password";
import * as memberService from "@/server/services/member.service";
import * as userRepo from "@/server/repositories/user.repository";
import * as userService from "@/server/services/user.service";

/**
 * 마이페이지 액션 (`FR-USER-002`·`007`, `SCR-141`).
 *
 * **본인 것만 고칩니다.** 대상 id 를 입력으로 받지 않고 `requireActor()` 가
 * 준 것을 씁니다 — 받으면 「남의 id 를 넣으면?」이 검사해야 할 항목이 되고,
 * 그 검사를 빠뜨리는 날이 옵니다.
 */

/** API-069 프로필 수정 (`FR-USER-002`) */
export async function updateProfileAction(
  input: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = z
      .object({
        name: z.string().trim().min(1, "이름을 적어 주세요.").max(50),
        department: z.string().trim().max(50).nullable().optional(),
        bio: z.string().trim().max(500).nullable().optional(),
      })
      .safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    await userService.updateProfile(actor.id, parsed.data);

    /*
     * **레이아웃까지 비웁니다.** 사이드바의 사용자 카드가 이름을 보여주므로,
     * 페이지만 비우면 「저장했는데 왼쪽은 옛 이름」이 됩니다.
     */
    revalidatePath("/me");
    revalidatePath("/", "layout");
    return ok(undefined);
  });
}

/**
 * API-070 회원 탈퇴 (`FR-USER-007`).
 *
 * ## 비밀번호를 다시 받습니다
 *
 * `REQ-02 · 2.3` 이 「본인 탈퇴 — 비밀번호 재확인」으로 정했습니다.
 * 되돌릴 수 없고, 자리를 비운 사이 남이 누를 수 있는 조작입니다.
 *
 * ## 강제 탈퇴와 **같은 함수**를 지납니다
 *
 * `member.service.transition` 의 `WITHDRAW` 입니다 — 마지막 관리자 보호,
 * 세션 만료, API 키 폐기, 개인정보 마스킹, 감사 로그가 전부 그 안에 있습니다.
 * 본인용 경로를 따로 만들면 그중 하나를 빠뜨립니다.
 *
 * 감사 로그의 행위자는 **본인**입니다 — 관리자가 한 것과 구별되어야 합니다.
 */
export async function withdrawSelfAction(
  input: unknown
): Promise<ActionResult<void>> {
  return guard(async () => {
    const actor = await requireActor();
    const parsed = z
      .object({ password: z.string().min(1, "비밀번호를 입력해 주세요.") })
      .safeParse(input);
    if (!parsed.success) return validationError(parsed.error);

    const user = await userRepo.findById(actor.id);
    if (!user) return validationError(new z.ZodError([]));

    const okPassword = await verifyPassword(
      parsed.data.password,
      user.passwordHash
    );
    if (!okPassword) {
      /*
       * **`VALIDATION_ERROR` 로 돌려줍니다.** 로그인 화면이 아니므로
       * 「비밀번호가 틀렸다」를 말해도 새는 정보가 없습니다 — 이미 로그인해
       * 있는 본인입니다.
       */
      return validationError(
        new z.ZodError([
          {
            code: "custom",
            path: ["password"],
            message: "비밀번호가 맞지 않습니다.",
          },
        ])
      );
    }

    await memberService.transition(actor, actor.id, {
      kind: "WITHDRAW",
      reason: "본인 요청으로 탈퇴했습니다.",
    });

    return ok(undefined);
  });
}
