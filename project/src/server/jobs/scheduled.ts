import "server-only";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { safeFetch } from "@/lib/safe-fetch";
import * as storage from "@/lib/storage";
import { register } from "@/server/services/job.service";

/**
 * 스케줄 작업 셋 (`REQ-04 · 4.8`).
 *
 * | 작업 | 주기 | 하는 일 |
 * | --- | --- | --- |
 * | `REFRESH_GITHUB_META` | 주 1회 | 등록된 저장소 메타 갱신, 소실 감지 |
 * | `CHECK_LINK` | 월 1회 | 원본 링크 생존 확인 |
 * | `CLEANUP_TRASH` | 일 1회 | 30일 지난 삭제 자료 정리 |
 *
 * ## 언제 도는가는 여기 없습니다
 *
 * 주기는 `maintenance.service` 가 압니다. 이 파일은 **무엇을 하는가**만
 * 압니다 — `DEC-053` 이 「`jobs` 행을 만드는 자리」와 「실행하는 자리」를
 * 나눠 둔 이유이고, 나중에 큐로 옮길 때 바뀌는 것은 앞쪽뿐입니다.
 *
 * ## 하나가 실패해도 나머지는 돕니다
 *
 * 저장소 100개 중 3개가 사라졌다고 갱신 작업 전체를 실패로 만들면, 나머지
 * 97개는 영원히 안 갱신됩니다. **건별로 세고 결과를 payload 에 남깁니다** —
 * `admin/jobs` 가 그 숫자를 보여줍니다.
 */

/* ── 주 1회: 저장소 메타 갱신 ─────────────────────────────────────── */

register("REFRESH_GITHUB_META", async () => {
  const repos = await db.githubRepo.findMany({
    where: { resource: { deletedAt: null } },
    select: { resourceId: true },
  });

  /*
   * **여기서 GitHub 을 부르지 않습니다.** 개별 수집은 이미
   * `FETCH_GITHUB_META` 가 하고, 그쪽은 실패·소실 처리·`is_gone` 을 압니다.
   * 이 작업은 **그것을 저장소 수만큼 큐에 넣는 일**만 합니다 —
   * 규칙을 두 곳에 두지 않기 위해서입니다.
   *
   * 동시 실행은 `job.service` 의 세마포어(2)가 막습니다. 토큰 없이 시간당
   * 60회이므로 저장소가 그보다 많으면 일부는 다음 주에 갱신됩니다 —
   * 그것이 「전부 실패」보다 낫습니다.
   */
  const { enqueue } = await import("@/server/services/job.service");
  for (const r of repos) {
    await enqueue({ type: "FETCH_GITHUB_META", resourceId: r.resourceId });
  }

  return { queued: repos.length };
});

/* ── 월 1회: 원본 링크 생존 확인 ──────────────────────────────────── */

/** 링크 하나에 이만큼 넘게 기다리지 않습니다 — 죽은 링크는 대개 응답이 없습니다 */
const LINK_TIMEOUT_MS = 8000;

/**
 * **우리 자신은 SSRF 가드에서 예외입니다.**
 *
 * 1단계 주소가 `http://localhost:3100` 이라 가드에 그대로 걸립니다. 여는 것이
 * 새 능력을 주지 않는 이유는 `lib/safe-fetch.ts` 의 `allowOrigins` 주석에
 * 있습니다 — 한 줄로 줄이면 **쿠키 없이 나가므로 비로그인 요청과 같습니다.**
 */
const SELF = [new URL(env.APP_URL).origin];

/**
 * 한 링크의 생존.
 *
 * **`HEAD` 를 먼저 씁니다.** 본문을 안 받으므로 빠르고, 200건을 순회할 때
 * 차이가 큽니다. 다만 `HEAD` 를 막아 둔 서버가 있어 `405`·`501` 이면
 * `GET` 으로 한 번 더 봅니다 — 그것을 「죽었다」로 세면 멀쩡한 링크가
 * 대량으로 `GONE` 이 됩니다.
 */
async function probe(url: string): Promise<"OK" | "MOVED" | "GONE"> {
  const ctl = AbortSignal.timeout(LINK_TIMEOUT_MS);
  try {
    /*
     * **`safeFetch` 입니다 — 맨 `fetch` 가 아닙니다** (`NFR-SEC-010`).
     *
     * 여기 들어오는 `url` 은 **자료를 등록한 사람이 적은 값**이고, 이 배치는
     * 그것을 «서버에서» 가져옵니다. 맨 `fetch` 로 두면 등록자가
     * `http://192.168.0.1/` 을 넣어 사내망을 훑을 수 있습니다 — 응답을 못 봐도
     * 「닿았는가」가 `sourceStatus` 로 화면에 그대로 나옵니다.
     *
     * `redirect: "follow"` 도 함께 사라졌습니다. 바깥 주소가 사설 IP 로
     * 튕기면 첫 검사를 통과한 뒤에 안쪽으로 들어갑니다.
     */
    let { res, finalUrl } = await safeFetch(url, { method: "HEAD", signal: ctl }, SELF);
    if (res.status === 405 || res.status === 501) {
      ({ res, finalUrl } = await safeFetch(url, { method: "GET", signal: ctl }, SELF));
    }
    if (res.status === 404 || res.status === 410) return "GONE";
    if (!res.ok) {
      /*
       * **`5xx`·`403` 을 「죽었다」로 세지 않습니다.** 서버가 잠깐 아프거나
       * 봇을 막는 것일 수 있고, 그때 `GONE` 으로 표시하면 멀쩡한 자료에
       * 「원본 없음」이 붙습니다 — 되돌리는 사람이 아무도 없습니다.
       */
      return "MOVED";
    }
    /*
     * 최종 주소가 다르면 옮겨 간 것입니다. **자동으로 고치지 않습니다** —
     * 단축 URL·추적 리다이렉트도 여기 걸리므로, 사람이 보고 판단합니다.
     */
    return finalUrl !== url ? "MOVED" : "OK";
  } catch {
    /*
     * 타임아웃 · DNS 실패 · **SSRF 가드가 거부한 내부 주소**(`UnsafeUrlError`).
     *
     * 셋 다 「지금은 확인하지 못했다」이고 `GONE` 이 아닙니다. 거부된 주소를
     * `GONE` 으로 뒀다가 되돌렸습니다 — `GONE` 은 「원본이 없어졌다」는 뜻인데
     * 우리는 그 주소를 **확인하지 않은** 것뿐입니다. 바로 위에서 「확인할 수
     * 없는 것을 죽었다고 표시하면 멀쩡한 자료에 『원본 없음』이 붙고 되돌리는
     * 사람이 아무도 없다」고 적어 둔 그 원칙입니다.
     */
    return "MOVED";
  }
}

register("CHECK_LINK", async () => {
  const targets = await db.resource.findMany({
    where: { deletedAt: null, url: { not: null } },
    select: { id: true, url: true },
  });

  const counts = { OK: 0, MOVED: 0, GONE: 0 };
  for (const t of targets) {
    const status = await probe(t.url!);
    counts[status]++;
    await db.resource.update({
      where: { id: t.id },
      data: { sourceStatus: status, sourceCheckedAt: new Date() },
    });
  }

  return { checked: targets.length, ...counts };
});

/* ── 일 1회: 30일 지난 휴지통 정리 ────────────────────────────────── */

/** 소프트 삭제 유예 (`FR-RES-007`) */
const TRASH_DAYS = 30;

register("CLEANUP_TRASH", async () => {
  const cutoff = new Date(Date.now() - TRASH_DAYS * 24 * 60 * 60 * 1000);
  const targets = await db.resource.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true, title: true },
  });
  if (targets.length === 0) return { purged: 0 };

  /*
   * **`resource.service.purge` 를 부르지 않습니다.** 그 함수는 `ADMIN` 액터를
   * 요구하는데(되돌릴 수 없는 조작이라 그렇습니다), 여기에는 사람이 없습니다.
   * 가짜 관리자 액터를 만들어 넘기면 **감사 로그에 없는 사람이 찍힙니다.**
   *
   * 대신 같은 일을 여기서 합니다 — 파일 키를 모아 두고, 행을 지우고,
   * 커밋 뒤 디스크를 정리하고, **행위자 없는 기록**을 남깁니다.
   */
  const staleKeys: string[] = [];
  let purged = 0;

  for (const t of targets) {
    await db.$transaction(async (tx) => {
      const links = await tx.resourceFile.findMany({
        where: { resourceId: t.id },
        select: {
          file: {
            select: {
              id: true,
              storageKey: true,
              _count: { select: { resources: true } },
            },
          },
        },
      });
      // 다른 자료도 쓰는 파일은 남깁니다 (`resource.service.purge` 와 같은 규칙)
      const orphans = links.filter((l) => l.file._count.resources <= 1);
      for (const l of orphans) staleKeys.push(l.file.storageKey);

      await tx.file.deleteMany({
        where: { id: { in: orphans.map((l) => l.file.id) } },
      });
      await tx.resource.delete({ where: { id: t.id } });
    });
    purged++;
  }

  for (const key of staleKeys) {
    await storage.remove(key).catch((e: unknown) => {
      console.error("[cleanup] 파일 삭제 실패 — 고아 파일이 남습니다:", key, e);
    });
  }

  /*
   * **한 줄로 남깁니다.** 200건을 지웠다고 감사 로그에 200줄을 넣으면
   * 그날의 다른 기록이 전부 밀려납니다. 무엇을 지웠는지는 제목 목록으로.
   */
  await db.auditLog.create({
    data: {
      via: "WEB",
      action: "RESOURCE_PURGE",
      targetType: "resource",
      summary: `휴지통 자동 정리 — ${purged}건 (삭제 후 ${TRASH_DAYS}일 경과)`,
      diff: {
        titles: {
          before: "-",
          after: targets
            .slice(0, 20)
            .map((t) => t.title)
            .join(", "),
        },
      },
    },
  });

  return { purged, files: staleKeys.length };
});
