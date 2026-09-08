import "server-only";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/server/auth/actor";
import * as audit from "@/server/services/audit.service";

/**
 * 태그 관리 (`FR-ADM-013`) · 자동완성 (`FR-SRCH-007`).
 *
 * ## 왜 필요한가
 *
 * 태그는 자유 입력입니다. CLI 수집이 붙으면(`P7`) 에이전트가 만드는 태그가
 * 빠르게 늘고, `rag`·`RAG`·`retrieval-augmented` 가 따로 생기면 **태그로
 * 찾는 일 자체가 안 됩니다.** 방어선은 둘입니다 —
 * ① 만들기 전에 기존 것을 보여주는 **자동완성**, ② 이미 갈라진 것을 합치는
 * **병합**. 하나만으로는 부족합니다.
 *
 * ## `usage_count` 는 **표시용 캐시**입니다
 *
 * 정본은 `resource_tags` 행입니다. 병합·정리는 행을 옮긴 뒤 **다시 세어**
 * 캐시를 맞춥니다 — 증감으로 맞추면 한 번 어긋난 값이 영원히 남습니다.
 */

export interface TagRow {
  slug: string;
  label: string;
  count: number;
}

/**
 * 자동완성 후보 (`FR-SRCH-007`).
 *
 * **앞부분 일치를 먼저** 올립니다. `rag` 를 치는 사람이 찾는 것은 대개
 * `rag` 로 시작하는 태그이고, `storage`(`ra` 포함) 가 아닙니다.
 *
 * 이미 고른 것은 빼고 줍니다 — 목록에 남아 있으면 두 번 고를 수 있고,
 * 그건 화면에서만 이상해 보입니다(저장은 중복을 제거합니다).
 */
export async function suggest(
  q: string,
  exclude: string[] = [],
  limit = 8
): Promise<TagRow[]> {
  const term = q.trim().toLowerCase();
  if (term.length === 0) return [];

  const rows = await db.tag.findMany({
    /*
     * **두 조건을 한 `slug` 키에 담습니다.**
     *
     * 처음에는 `slug: { contains }` 뒤에 `...(exclude.length ? { slug: { notIn } } : {})`
     * 를 폈는데, **뒤의 `slug` 가 앞을 덮어써서** 이미 고른 태그가 있는 순간
     * 검색어가 사라지고 «전체 태그»가 후보로 나왔습니다. 객체에 같은 키를 두
     * 번 쓰는 것은 타입 오류가 아니라 **조용히 마지막 것만 남습니다.**
     */
    where: {
      slug: {
        contains: term,
        mode: "insensitive",
        ...(exclude.length ? { notIn: exclude } : {}),
      },
    },
    select: { slug: true, label: true, usageCount: true },
    // 많이 쓰는 것부터 — 자동완성은 «흔한 것»을 권해야 태그가 모입니다
    orderBy: [{ usageCount: "desc" }, { slug: "asc" }],
    take: limit * 3,
  });

  const scored = rows
    .map((t) => ({
      slug: t.slug,
      label: t.label,
      count: t.usageCount,
      starts: t.slug.toLowerCase().startsWith(term),
    }))
    .sort((a, b) => {
      if (a.starts !== b.starts) return a.starts ? -1 : 1;
      return b.count - a.count;
    })
    .slice(0, limit);

  return scored.map(({ slug, label, count }) => ({ slug, label, count }));
}

/** 관리 화면의 태그 목록 — **안 쓰는 것도 보여줍니다**(정리 대상이므로) */
export async function listAll(): Promise<TagRow[]> {
  const rows = await db.tag.findMany({
    select: { slug: true, label: true, usageCount: true },
    orderBy: [{ usageCount: "desc" }, { slug: "asc" }],
  });
  return rows.map((t) => ({
    slug: t.slug,
    label: t.label,
    count: t.usageCount,
  }));
}

/*
 * `assertAdmin(actor)` 이 아래 넷(병합·이름 변경·정리·재집계) 앞에 서 있었습니다.
 * **지웠습니다** (`DEC-077`) — 등급이 사라져 언제나 통과가 됐습니다.
 * 남은 문은 액션의 `requireActor()` 이고, 에이전트가 닿는 라우트는 없습니다
 * (`category.service` 머리말에 같은 이야기가 조금 더 자세히 있습니다).
 */

/**
 * 병합 — `from` 을 `into` 로 합치고 `from` 을 지웁니다.
 *
 * ## 같은 자료에 둘 다 붙어 있을 수 있습니다
 *
 * `resource_tags` 는 `(resource_id, tag_id)` 유니크입니다. 그냥
 * `updateMany` 로 태그 id 를 바꾸면 **그런 자료에서 유니크 위반**이 납니다.
 * 그래서 겹치는 행을 **먼저 지우고** 나머지를 옮깁니다 — 결과는 같고
 * (자료에 `into` 가 한 번 붙음) 실패하지 않습니다.
 *
 * ## 캐시는 **다시 세어** 맞춥니다
 *
 * `usage_count += n` 으로 맞추면 위에서 지운 중복만큼 부풀고, 그 오차는
 * 다음 병합에서 또 커집니다.
 */
export async function merge(
  actor: Actor,
  from: string,
  into: string
): Promise<{ moved: number; merged: number }> {
  if (from === into) {
    throw new AppError("VALIDATION_ERROR", "같은 태그로는 병합할 수 없습니다.");
  }

  return db.$transaction(async (tx) => {
    const [src, dst] = await Promise.all([
      tx.tag.findUnique({
        where: { slug: from },
        select: { id: true, label: true },
      }),
      tx.tag.findUnique({
        where: { slug: into },
        select: { id: true, label: true },
      }),
    ]);
    if (!src)
      throw new AppError("NOT_FOUND", `태그를 찾을 수 없습니다: ${from}`);
    if (!dst)
      throw new AppError("NOT_FOUND", `태그를 찾을 수 없습니다: ${into}`);

    // 둘 다 붙은 자료 — 옮기면 유니크 위반이므로 `from` 쪽을 버립니다
    const both = await tx.resourceTag.findMany({
      where: {
        tagId: src.id,
        resource: { tags: { some: { tagId: dst.id } } },
      },
      select: { resourceId: true },
    });
    const overlapping = both.map((r) => r.resourceId);

    if (overlapping.length > 0) {
      await tx.resourceTag.deleteMany({
        where: { tagId: src.id, resourceId: { in: overlapping } },
      });
    }
    const movedResult = await tx.resourceTag.updateMany({
      where: { tagId: src.id },
      data: { tagId: dst.id },
    });

    await tx.tag.delete({ where: { id: src.id } });

    // **다시 셉니다** — 증감으로 맞추면 한 번 어긋난 값이 영원히 남습니다
    const count = await tx.resourceTag.count({ where: { tagId: dst.id } });
    await tx.tag.update({
      where: { id: dst.id },
      data: { usageCount: count },
    });

    await audit.log(
      actor,
      {
        action: "SETTING_UPDATE",
        targetType: "tag",
        targetId: dst.id,
        summary: `태그 병합 — #${from} → #${into}`,
        diff: {
          moved: { before: "-", after: String(movedResult.count) },
          duplicates: { before: "-", after: String(overlapping.length) },
          usageCount: { before: "-", after: String(count) },
        },
      },
      tx
    );

    return { moved: movedResult.count, merged: overlapping.length };
  });
}

/**
 * 이름 변경.
 *
 * **`slug` 도 바꿉니다.** 태그의 slug 는 필터 주소에 실리지만, 카테고리와
 * 달리 태그는 **자료를 등록하며 즉흥적으로 생깁니다** — 오타를 고칠 길이
 * 없으면 병합밖에 답이 없고, 그건 태그 하나를 고치려고 두 개를 만드는 일입니다.
 * 이미 있는 slug 로 바꾸려 하면 **병합을 안내**합니다.
 */
export async function rename(
  actor: Actor,
  slug: string,
  next: { slug: string; label: string }
): Promise<void> {
  await db.$transaction(async (tx) => {
    const target = await tx.tag.findUnique({
      where: { slug },
      select: { id: true, slug: true, label: true },
    });
    if (!target) throw new AppError("NOT_FOUND", "태그를 찾을 수 없습니다.");

    if (next.slug !== slug) {
      const clash = await tx.tag.findUnique({
        where: { slug: next.slug },
        select: { id: true },
      });
      if (clash) {
        throw new AppError(
          "DUPLICATE",
          `#${next.slug} 은(는) 이미 있습니다. 합치려면 «병합»을 쓰세요.`
        );
      }
    }

    await tx.tag.update({
      where: { id: target.id },
      data: { slug: next.slug, label: next.label },
    });

    await audit.log(
      actor,
      {
        action: "SETTING_UPDATE",
        targetType: "tag",
        targetId: target.id,
        summary: `태그 이름 변경 — #${slug} → #${next.slug}`,
        diff: {
          slug: { before: target.slug, after: next.slug },
          label: { before: target.label, after: next.label },
        },
      },
      tx
    );
  });
}

/**
 * 안 쓰는 태그 정리.
 *
 * **`usage_count` 가 아니라 실제 행을 셉니다.** 캐시가 어긋나 있으면
 * 쓰이는 태그를 지울 수 있고, 그건 되돌릴 수 없습니다 — 정리는 조용히
 * 여러 개를 지우는 동작이라 근거가 캐시여서는 안 됩니다.
 */
export async function cleanup(actor: Actor): Promise<{ removed: string[] }> {
  return db.$transaction(async (tx) => {
    const orphans = await tx.tag.findMany({
      where: { resources: { none: {} } },
      select: { id: true, slug: true },
    });
    if (orphans.length === 0) return { removed: [] };

    await tx.tag.deleteMany({
      where: { id: { in: orphans.map((t) => t.id) } },
    });

    const removed = orphans.map((t) => t.slug);
    await audit.log(
      actor,
      {
        action: "SETTING_UPDATE",
        targetType: "tag",
        summary: `안 쓰는 태그 정리 — ${removed.length}개`,
        diff: { removed: { before: "-", after: removed.join(", ") } },
      },
      tx
    );
    return { removed };
  });
}

/**
 * 캐시를 실제 행 수로 다시 맞춥니다.
 *
 * `usage_count` 는 등록·수정이 갱신하는 표시용 캐시라 **어긋날 수 있습니다**
 * (직접 DB 를 만졌거나, 예전 코드가 남긴 값). 관리 화면에 「다시 세기」를
 * 두는 편이, 어긋난 것을 보고도 손쓸 수 없는 것보다 낫습니다.
 */
export async function recount(actor: Actor): Promise<{ fixed: number }> {
  const rows = await db.tag.findMany({
    select: {
      id: true,
      usageCount: true,
      _count: { select: { resources: true } },
    },
  });
  const wrong = rows.filter((t) => t.usageCount !== t._count.resources);
  if (wrong.length === 0) return { fixed: 0 };

  await db.$transaction(async (tx) => {
    for (const t of wrong) {
      await tx.tag.update({
        where: { id: t.id },
        data: { usageCount: t._count.resources },
      });
    }
    await audit.log(
      actor,
      {
        action: "SETTING_UPDATE",
        targetType: "tag",
        summary: `태그 사용 수 재계산 — ${wrong.length}개 정정`,
      },
      tx
    );
  });

  return { fixed: wrong.length };
}

/** 「안 쓰는 태그」가 몇 개인가 — 정리 버튼이 무엇을 지울지 미리 말한다 */
export async function countUnused(): Promise<number> {
  return db.tag.count({ where: { resources: { none: {} } } });
}
