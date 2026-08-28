import "server-only";

import { db } from "@/lib/db";

/**
 * 시스템 설정 (`system_settings`, `FR-ADM-015`).
 *
 * ## 같은 열쇠를 두 곳에서 읽고 있었습니다
 *
 * `auth.service.signUp` 이 `signup.enabled` 를 읽어 가입을 막고,
 * `admin/settings` **page 가 Prisma 를 직접 불러** 같은 행을 읽어 스위치를
 * 그렸습니다. 열쇠 문자열이 두 곳에 있으니 한쪽 오타가 **조용히** 「설정 없음」이
 * 되고, 그러면 화면은 꺼진 것처럼 보이는데 가입은 열려 있습니다.
 *
 * 「없음」의 뜻도 두 곳에서 각자 정하고 있었습니다 — 여기서 한 번 정합니다:
 * **행이 없으면 켜진 것**입니다(기본은 가입 허용).
 *
 * ## page 가 `db` 를 직접 부르지 않습니다 (`DEV-06 · 6.6`)
 *
 * 화면이 Prisma 를 부르면 「어떤 조건으로 읽는가」가 화면마다 갈립니다 —
 * `resources` 의 `deleted_at IS NULL` 을 호출부마다 기억하게 했다가 겪은 것과
 * 같은 형태입니다. `check-deps` 가 이제 `app → @/lib/db` 를 막습니다.
 */

/** 신규 가입을 받는가. **행이 없으면 받는다** */
export async function isSignupEnabled(): Promise<boolean> {
  const row = await db.systemSetting.findUnique({
    where: { key: "signup.enabled" },
  });
  return row?.value !== false;
}
