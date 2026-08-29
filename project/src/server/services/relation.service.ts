import "server-only";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { canEditResource, type Actor } from "@/server/auth/actor";
import * as audit from "@/server/services/audit.service";
import type { RelationType, ResourceType } from "@/types";

/**
 * 자료 간 연결 (`FR-RES-012`).
 *
 * ## 「양방향」이 무슨 뜻인가
 *
 * 요구사항이 *"자료끼리 **양방향**으로 연결한다"* 입니다. 행을 두 개 만들지는
 * 않습니다 — **한 행을 양쪽에서 읽습니다.** 두 행을 만들면 한쪽만 지워지는
 * 순간 「A 에서는 보이는데 B 에서는 안 보이는」 상태가 되고, 그건 이 저장소가
 * 반복해서 피한 「한 사실을 두 곳에」입니다.
 *
 * ## 방향이 있는 관계와 없는 관계가 섞입니다
 *
 * | 종류 | 방향 | 반대쪽에서 보면 |
 * | --- | --- | --- |
 * | `RELATED` 관련 | 없음 | 「관련」 |
 * | `SOURCE_OF` 출처 | 있음 | 「~에서 파생」 |
 * | `SUPERSEDES` 대체 | 있음 | 「~로 대체됨」 |
 * | `PART_OF` 일부 | 있음 | 「구성 요소」 |
 *
 * 그래서 목록을 낼 때 **어느 쪽에서 보고 있는지**를 함께 돌려줍니다.
 * 「A 가 B 를 대체한다」와 「A 가 B 로 대체됐다」는 다른 문장입니다.
 *
 * ## `findRelated`(태그 겹침)와 다릅니다
 *
 * 그쪽은 **추측**이고 이쪽은 **사람이 이은 것**입니다. 상세 화면에서 둘을
 * 나눠 보여줘야 「왜 이게 관련이지?」가 안 생깁니다.
 */

export const RELATION_LABEL: Record<RelationType, string> = {
  RELATED: "관련",
  SOURCE_OF: "출처",
  SUPERSEDES: "대체함",
  PART_OF: "일부",
};

/** 반대쪽에서 읽을 때의 라벨 */
export const RELATION_LABEL_REVERSE: Record<RelationType, string> = {
  RELATED: "관련",
  SOURCE_OF: "~에서 파생",
  SUPERSEDES: "~로 대체됨",
  PART_OF: "구성 요소",
};

export interface LinkedResource {
  id: string;
  slug: string;
  type: ResourceType;
  title: string;
  relationType: RelationType;
  /** 이 자료가 «가리키는» 쪽인가. 라벨을 뒤집을지 판단한다 */
  outgoing: boolean;
}

const CARD = {
  id: true,
  slug: true,
  type: true,
  title: true,
} as const;

/** 이 자료에 이어진 것들. **한 행을 양쪽에서 읽습니다** */
export async function listFor(resourceId: string): Promise<LinkedResource[]> {
  const [out, incoming] = await Promise.all([
    db.resourceRelation.findMany({
      where: { fromId: resourceId, to: { deletedAt: null } },
      select: { relationType: true, to: { select: CARD } },
      orderBy: { createdAt: "asc" },
    }),
    db.resourceRelation.findMany({
      where: { toId: resourceId, from: { deletedAt: null } },
      select: { relationType: true, from: { select: CARD } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return [
    ...out.map((r) => ({
      ...r.to,
      type: r.to.type as ResourceType,
      relationType: r.relationType as RelationType,
      outgoing: true,
    })),
    ...incoming.map((r) => ({
      ...r.from,
      type: r.from.type as ResourceType,
      relationType: r.relationType as RelationType,
      outgoing: false,
    })),
  ];
}

/**
 * 이을 상대를 찾는다.
 *
 * **이미 이어진 것과 자기 자신은 뺍니다** — 목록에 보이면 눌러 보게 되고,
 * 그때 「이미 이어져 있습니다」를 띄우는 것보다 안 보이는 편이 낫습니다.
 */
export async function searchTargets(
  resourceId: string,
  q: string
): Promise<{ id: string; title: string; typeLabel: string }[]> {
  const linked = await db.resourceRelation.findMany({
    where: { OR: [{ fromId: resourceId }, { toId: resourceId }] },
    select: { fromId: true, toId: true },
  });
  const exclude = new Set<string>([resourceId]);
  for (const r of linked) {
    exclude.add(r.fromId);
    exclude.add(r.toId);
  }

  const rows = await db.resource.findMany({
    where: {
      deletedAt: null,
      status: "PUBLISHED",
      id: { notIn: [...exclude] },
      ...(q.trim() ? { title: { contains: q.trim(), mode: "insensitive" } } : {}),
    },
    select: { id: true, title: true, type: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    typeLabel: r.type as string,
  }));
}

/**
 * 잇는다.
 *
 * **자기 자신은 못 잇습니다** — DB 에도 `CHECK from <> to` 가 있지만
 * 여기서 먼저 막아 「처리 중 문제가 발생했습니다」 대신 이유를 말합니다.
 */
export async function link(
  actor: Actor,
  fromId: string,
  toId: string,
  relationType: RelationType
): Promise<void> {
  if (fromId === toId) {
    throw new AppError("VALIDATION_ERROR", "자기 자신과는 이을 수 없습니다.");
  }

  const [from, to] = await Promise.all([
    db.resource.findFirst({
      where: { id: fromId, deletedAt: null },
      select: { id: true, authorId: true, title: true },
    }),
    db.resource.findFirst({
      where: { id: toId, deletedAt: null },
      select: { id: true, title: true },
    }),
  ]);
  if (!from || !to) throw new AppError("NOT_FOUND", "자료를 찾을 수 없습니다.");
  if (!canEditResource(actor, from.authorId)) {
    throw new AppError("FORBIDDEN", "이 자료를 수정할 권한이 없습니다.");
  }

  /*
   * **이미 이어져 있으면 조용히 넘어갑니다.** 두 사람이 같은 연결을 만드는 것은
   * 오류가 아니라 같은 판단입니다 — `P2002` 를 「처리 중 문제」로 보여줄 이유가
   * 없습니다. 반대 방향으로 이미 있는 경우도 같습니다(한 행을 양쪽에서 읽으므로).
   */
  const existing = await db.resourceRelation.findFirst({
    where: {
      relationType,
      OR: [
        { fromId, toId },
        { fromId: toId, toId: fromId },
      ],
    },
    select: { id: true },
  });
  if (existing) return;

  await db.$transaction(async (tx) => {
    await tx.resourceRelation.create({
      data: { fromId, toId, relationType, createdById: actor.id },
    });
    await audit.log(
      actor,
      {
        action: "RESOURCE_UPDATE",
        targetType: "RESOURCE",
        targetId: fromId,
        summary: `${from.title} ↔ ${to.title} (${RELATION_LABEL[relationType]}) 연결`,
      },
      tx
    );
  });
}

/** 끊는다. **어느 쪽에서 눌러도 됩니다** — 한 행이므로 방향을 따지지 않습니다 */
export async function unlink(
  actor: Actor,
  resourceId: string,
  otherId: string,
  relationType: RelationType
): Promise<void> {
  const row = await db.resourceRelation.findFirst({
    where: {
      relationType,
      OR: [
        { fromId: resourceId, toId: otherId },
        { fromId: otherId, toId: resourceId },
      ],
    },
    select: { id: true, from: { select: { authorId: true, title: true } } },
  });
  if (!row) throw new AppError("NOT_FOUND", "연결을 찾을 수 없습니다.");

  /*
   * **만든 쪽 자료의 소유권**을 봅니다. 반대쪽에서 끊으려는 사람이 그 자료를
   * 못 고치면 거부합니다 — 안 그러면 남의 자료에 붙은 연결을 아무나 끊습니다.
   */
  if (!canEditResource(actor, row.from.authorId)) {
    throw new AppError("FORBIDDEN", "이 연결을 끊을 권한이 없습니다.");
  }

  await db.$transaction(async (tx) => {
    await tx.resourceRelation.delete({ where: { id: row.id } });
    await audit.log(
      actor,
      {
        action: "RESOURCE_UPDATE",
        targetType: "RESOURCE",
        targetId: resourceId,
        summary: `${row.from.title} 의 연결 해제 (${RELATION_LABEL[relationType]})`,
      },
      tx
    );
  });
}
