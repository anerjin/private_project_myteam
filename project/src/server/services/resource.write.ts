import "server-only";

import type { Prisma, ResourceType } from "@prisma/client";

import type { ParsedResourceInput } from "@/features/resources/form.schema";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/server/auth/actor";
import * as audit from "@/server/services/audit.service";

/**
 * 자료 등록·수정 (FR-RES-004~006, FR-RES-011).
 *
 * **`resource.service.ts` 와 파일을 나눈 이유**: 그쪽은 읽기(목록·상세·집계)라
 * 화면 여러 곳이 부르고, 여기는 쓰기라 액션 두 개만 부릅니다. 한 파일에 두면
 * 목록을 고치는 사람이 등록 트랜잭션까지 읽어야 합니다 (`member.repository` 와
 * `user.repository` 를 나눈 것과 같은 판단).
 */

/**
 * URL 정규화 (`FR-RES-011`).
 *
 * 중복 감지가 **정규화된 값**으로 이뤄집니다. 안 하면
 * `https://x.com/a?utm_source=b` 와 `http://www.x.com/a/` 가 다른 자료가 됩니다.
 *
 * - 스킴을 `https` 로, 호스트를 소문자로
 * - `www.` 제거, 끝 슬래시 제거
 * - 추적 파라미터(`utm_*`·`fbclid`·`gclid`) 제거 후 **남은 쿼리는 정렬**
 * - 프래그먼트(`#`) 제거
 *
 * 파싱 실패는 **예외가 아니라 `undefined`** 입니다 — URL 은 선택 항목이고,
 * 중복 감지를 못 하는 것이 등록을 막을 이유는 아닙니다.
 */
export function normalizeUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;

    url.protocol = "https:";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.hash = "";

    const keep = [...url.searchParams.entries()]
      .filter(([k]) => !/^(utm_|fbclid$|gclid$|ref$|source$)/i.test(k))
      .sort(([a], [b]) => a.localeCompare(b));
    url.search = "";
    for (const [k, v] of keep) url.searchParams.append(k, v);

    const path = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.origin}${path}${url.search}`;
  } catch {
    return undefined;
  }
}

/**
 * slug 생성.
 *
 * **한글을 버리지 않습니다.** 처음에는 라틴 문자만 남겼는데,
 * 「검증용 AI 자료」가 **`-ai-`** 가 됐습니다 — 한글을 지우고 남은 찌꺼기입니다.
 * 팀이 한국어로 제목을 쓰므로 대부분의 제목이 그렇게 망가집니다.
 * URL 의 한글은 브라우저가 알아서 인코딩하고 주소창에는 한글로 보입니다.
 *
 * 하이픈이 앞뒤·연속으로 남지 않게 정리하고, **남는 게 없을 때만** 난수로 갑니다.
 */
function toSlug(title: string, type: ResourceType): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, " ")
    .trim()
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");

  return slug.length >= 2
    ? slug
    : `${type.toLowerCase().replace(/_/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 유일한 slug 를 만든다. 충돌하면 `-2`, `-3` … */
async function uniqueSlug(
  tx: Prisma.TransactionClient,
  title: string,
  type: ResourceType
): Promise<string> {
  const base = toSlug(title, type);
  for (let n = 1; n <= 50; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const taken = await tx.resource.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!taken) return slug;
  }
  // 50번 부딪히면 제목 기반을 포기한다 — 등록을 막지 않는다
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * 태그를 만들고 잇는다.
 *
 * `tags.usage_count` 는 **표시용 캐시**(인기 태그)이고 정본은 `resource_tags` 입니다.
 * 그래서 증감이 아니라 **세어서 씁니다** — 북마크 카운트와 같은 판단입니다.
 */
async function syncTags(
  tx: Prisma.TransactionClient,
  resourceId: string,
  slugs: string[]
): Promise<void> {
  const before = await tx.resourceTag.findMany({
    where: { resourceId },
    select: { tagId: true },
  });

  await tx.resourceTag.deleteMany({ where: { resourceId } });

  const tagIds: string[] = [];
  for (const slug of slugs) {
    const tag = await tx.tag.upsert({
      where: { slug },
      create: { slug, label: slug },
      update: {},
      select: { id: true },
    });
    tagIds.push(tag.id);
  }
  if (tagIds.length > 0) {
    await tx.resourceTag.createMany({
      data: tagIds.map((tagId) => ({ resourceId, tagId })),
    });
  }

  // 영향받은 태그만 다시 센다
  const touched = new Set([...before.map((b) => b.tagId), ...tagIds]);
  for (const tagId of touched) {
    const usageCount = await tx.resourceTag.count({ where: { tagId } });
    await tx.tag.update({ where: { id: tagId }, data: { usageCount } });
  }
}

/** 타입별 상세 테이블에 쓴다 — `resourceId` 가 PK 라 upsert 로 등록·수정을 겸한다 */
async function writeDetail(
  tx: Prisma.TransactionClient,
  resourceId: string,
  type: ResourceType,
  detail: Record<string, unknown>
): Promise<void> {
  if (type !== "AI_MATERIAL") {
    // `schemas.ts` 가 이미 막지만, service 도 스스로 확인한다 —
    // 웹 폼 말고 Ingest(P7)가 들어올 자리다
    throw new AppError(
      "VALIDATION_ERROR",
      "이 타입은 아직 등록할 수 없습니다. (P5)"
    );
  }

  const d = detail as {
    materialKind:
      "PAPER" | "ARTICLE" | "VIDEO" | "MODEL" | "SERVICE" | "COURSE";
    sourceName?: string;
    authors?: string[];
    publishedAt?: string;
    language?: "KO" | "EN" | "ETC";
    readingTime?: number;
    keyPoints?: string;
    applicability?: string;
  };

  const data = {
    materialKind: d.materialKind,
    sourceName: d.sourceName ?? null,
    authors: d.authors ?? [],
    publishedAt: d.publishedAt ? new Date(d.publishedAt) : null,
    language: d.language ?? null,
    readingTime: d.readingTime ?? null,
    keyPoints: d.keyPoints ?? null,
    applicability: d.applicability ?? null,
  };

  await tx.aiMaterial.upsert({
    where: { resourceId },
    create: { resourceId, ...data },
    update: data,
  });
}

export interface DuplicateHint {
  id: string;
  slug: string;
  type: ResourceType;
  title: string;
}

/**
 * 같은 URL 의 자료가 이미 있는가 (`FR-RES-011`).
 *
 * **등록을 막지 않습니다.** 같은 글을 다른 관점으로 두 번 정리하는 일이 있고,
 * 막으면 사람이 URL 을 살짝 바꿔 우회합니다. 화면이 «이미 있습니다» 를 보여주고
 * 사람이 판단합니다.
 */
export async function findDuplicate(
  url: string | undefined
): Promise<DuplicateHint | null> {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;
  return db.resource.findFirst({
    where: { urlNormalized: normalized, deletedAt: null },
    select: { id: true, slug: true, type: true, title: true },
  });
}

export interface WriteResult {
  id: string;
  slug: string;
  type: ResourceType;
}

/** API-031 자료 등록 */
export async function create(
  actor: Actor,
  input: ParsedResourceInput
): Promise<WriteResult> {
  return db.$transaction(async (tx) => {
    const slug = await uniqueSlug(tx, input.title, input.type);
    const category = input.category
      ? await tx.category.findUnique({
          where: { slug: input.category },
          select: { id: true },
        })
      : null;

    const resource = await tx.resource.create({
      data: {
        type: input.type,
        slug,
        title: input.title,
        summary: input.summary ?? null,
        body: input.body ?? null,
        url: input.url ?? null,
        urlNormalized: normalizeUrl(input.url) ?? null,
        categoryId: category?.id ?? null,
        authorId: actor.id,
        // 「어느 경로로 들어왔는가」는 actor 가 안다 (DEC-029: 검수 대신 이것으로 구분)
        sourceChannel: actor.via === "MCP" ? "MCP" : "WEB",
      },
      select: { id: true, slug: true, type: true },
    });

    await writeDetail(tx, resource.id, input.type, input.detail);
    await syncTags(tx, resource.id, input.tags ?? []);

    await audit.log(
      actor,
      {
        action: "RESOURCE_CREATE",
        targetType: "resource",
        targetId: resource.id,
        summary: `자료 등록 — ${input.title}`,
        diff: { type: input.type, via: actor.via },
      },
      tx
    );

    return resource;
  });
}

/** API-032 자료 수정 — **타입은 바꿀 수 없습니다** (등록 후 타입 변경 금지) */
export async function update(
  actor: Actor,
  id: string,
  input: ParsedResourceInput
): Promise<WriteResult> {
  return db.$transaction(async (tx) => {
    const target = await tx.resource.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, slug: true, type: true, authorId: true, title: true },
    });
    if (!target) throw new AppError("NOT_FOUND", "자료를 찾을 수 없습니다.");

    // 소유권은 데이터를 봐야 알 수 있으므로 service 에서 (actor.ts)
    if (actor.role === "MEMBER" && target.authorId !== actor.id) {
      throw new AppError("FORBIDDEN", "이 자료를 수정할 권한이 없습니다.");
    }
    if (input.type !== target.type) {
      throw new AppError(
        "INVALID_STATE",
        "타입은 바꿀 수 없습니다. 새로 등록하고 «대체함» 으로 연결해 주세요."
      );
    }

    const category = input.category
      ? await tx.category.findUnique({
          where: { slug: input.category },
          select: { id: true },
        })
      : null;

    await tx.resource.update({
      where: { id },
      data: {
        title: input.title,
        summary: input.summary ?? null,
        body: input.body ?? null,
        url: input.url ?? null,
        urlNormalized: normalizeUrl(input.url) ?? null,
        categoryId: category?.id ?? null,
      },
    });

    await writeDetail(tx, id, target.type, input.detail);
    await syncTags(tx, id, input.tags ?? []);

    await audit.log(
      actor,
      {
        action: "RESOURCE_UPDATE",
        targetType: "resource",
        targetId: id,
        summary: `자료 수정 — ${input.title}`,
        diff: { title: { before: target.title, after: input.title } },
      },
      tx
    );

    return { id, slug: target.slug, type: target.type };
  });
}
