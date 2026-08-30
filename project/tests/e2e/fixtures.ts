import { randomBytes } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import type { Page } from "@playwright/test";

/**
 * E2E 가 쓰는 재료.
 *
 * ## 앱 코드를 import 하지 않습니다
 *
 * `@/lib/db` 를 쓰면 `server-only` 와 경로 별칭 때문에 Playwright 러너에서
 * 터집니다 — `job.service` 가 레지스트리를 부르다 React 를 끌어와 배치를
 * 죽일 뻔한 것과 같은 부류입니다. 여기서는 **Prisma 를 직접** 씁니다.
 *
 * ## 준비물은 «최소»로 만들고 반드시 치웁니다
 *
 * 시나리오마다 자기 계정을 만들고 끝나면 지웁니다. 남기면 다음 실행이
 * 「이미 있다」로 시작하고, 회원 목록에 검증 계정이 쌓입니다 —
 * `verify-p6` 가 계정 둘을 반년 남긴 그 자리입니다.
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL 이 없습니다. `npm run e2e` 는 .env 를 읽어 실행합니다."
  );
}

export const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

/**
 * 브라우저 밖에서 API 를 부를 때 쓰는 주소.
 *
 * **`playwright.config.ts` 의 `baseURL` 과 같은 값을 봐야 합니다.** 처음에는
 * `http://localhost:3100` 을 박아 뒀는데, 운영 빌드를 3101 에 띄우고 돌리니
 * 시나리오 ⑤⑥이 **`fetch failed`** 로 죽었습니다 — 화면은 3101 을 보고
 * API 만 3100 을 보고 있었던 것입니다. dev 가 켜져 있는 동안에는 그 어긋남이
 * 보이지 않았습니다.
 */
export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3100";

/** 이 접두사를 가진 것은 전부 E2E 가 만든 것 — 정리가 이 하나를 봅니다 */
export const E2E_PREFIX = "e2e_";

export const TEST_PASSWORD = "E2eTest!12345";

/**
 * **`server/auth/password.ts` 와 같은 파라미터여야 합니다.**
 *
 * 다르면 해시는 만들어지는데 **로그인이 안 됩니다** — argon2 파라미터가
 * 해시 문자열에 들어가므로 검증은 되지만, 시드·앱과 다른 값을 쓰면
 * 「비밀번호가 맞는데 틀렸다고 한다」를 디버깅하게 됩니다.
 */
const ARGON2 = { memoryCost: 65_536, timeCost: 3, parallelism: 1 } as const;

export function uniq(tag: string): string {
  return `${E2E_PREFIX}${tag}_${randomBytes(3).toString("hex")}`;
}

export async function makeUser(opts: {
  tag: string;
  role?: "MEMBER" | "EDITOR" | "ADMIN";
  status?: "PENDING" | "ACTIVE" | "SUSPENDED";
}) {
  const username = uniq(opts.tag);
  const user = await db.user.create({
    data: {
      username,
      // 시드와 **같은 파라미터**여야 로그인이 됩니다 (`auth/password.ts`)
      passwordHash: await hash(TEST_PASSWORD, ARGON2),
      name: `E2E ${opts.tag}`,
      role: opts.role ?? "MEMBER",
      status: opts.status ?? "ACTIVE",
    },
    select: { id: true, username: true, name: true },
  });
  return user;
}

/**
 * 화면으로 로그인합니다 — **쿠키를 심지 않습니다.**
 *
 * 세션을 직접 만들어 넣으면 로그인 폼·액션·리다이렉트가 검증에서 빠집니다.
 * 그게 바로 이 E2E 가 메우려는 구멍입니다.
 */
export async function signIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("아이디").fill(username);
  await page.getByLabel("비밀번호").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();

  /*
   * **끝날 때까지 기다립니다.** 클릭만 하고 나가면 다음 `goto` 가 세션이
   * 생기기 전에 떠나고, 그러면 `/login?next=…` 로 되돌아옵니다 — 실제로
   * 시나리오 ④가 그렇게 실패했고 **화면이 아니라 검사가 틀린** 것이었습니다.
   *
   * 로그인 화면을 «벗어나는» 것으로 판정합니다. 목적지는 상태마다 다릅니다
   * (`/dashboard`·`/pending`·`/change-password`) — 그걸 여기서 알 필요는 없습니다.
   */
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 30_000,
  });
  /*
   * **하이드레이션까지 기다립니다.** dev 서버는 첫 방문에 청크를 컴파일하므로
   * 리다이렉트 직후 버튼은 «보이지만 눌러도 아무 일이 없습니다» — 그 상태로
   * 클릭하면 조용히 지나가고, 다음 단언이 이유 없이 실패합니다.
   */
  await page.waitForLoadState("networkidle");
}

/** E2E 가 만든 것을 전부 치운다 — 접두사 하나로 찾는다 */
export async function cleanup() {
  const users = await db.user.findMany({
    where: { username: { startsWith: E2E_PREFIX } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);

  await db.resource.deleteMany({
    where: { title: { startsWith: "E2E " } },
  });
  if (ids.length > 0) {
    /*
     * **순서가 있습니다.** `files.uploaded_by` 는 `onDelete` 가 없어(기본
     * `Restrict`) 사용자 삭제를 막습니다 — `verify-p6` 가 그걸 몰라 계정
     * 둘을 남겼습니다.
     */
    await db.resourceFile.deleteMany({
      where: { file: { uploadedById: { in: ids } } },
    });
    await db.file.deleteMany({ where: { uploadedById: { in: ids } } });
    await db.session.deleteMany({ where: { userId: { in: ids } } });
    await db.apiKey.deleteMany({ where: { userId: { in: ids } } });
    await db.notification.deleteMany({ where: { userId: { in: ids } } });
    await db.bookmark.deleteMany({ where: { userId: { in: ids } } });
    await db.collectionItem.deleteMany({
      where: { collection: { ownerId: { in: ids } } },
    });
    await db.collection.deleteMany({ where: { ownerId: { in: ids } } });
    await db.resource.deleteMany({ where: { authorId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  }
  await db.reservedUsername.deleteMany({
    where: { username: { startsWith: E2E_PREFIX } },
  });
  /*
   * 태그는 자료를 지워도 남습니다 (`resource_tags` 만 정리됩니다). 안 지우면
   * 실행할 때마다 `e2e끝태그…` 가 인기 태그 목록에 쌓입니다.
   */
  await db.tag.deleteMany({ where: { slug: { startsWith: "e2e" } } });
}
