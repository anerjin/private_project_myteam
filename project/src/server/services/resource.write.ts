import "server-only";

import { randomBytes } from "node:crypto";

import type { Prisma, ResourceType } from "@prisma/client";

import { parseGithubUrl } from "@/features/resources/content-types/github-repo/schema";
import {
  toDetailRow,
  type DetailRow,
} from "@/features/resources/content-types/writers";
import type { ParsedResourceInput } from "@/features/resources/form.schema";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { scanValues } from "@/lib/secret-scan";
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
 * - **GitHub 저장소 주소는 `owner/repo` 까지 접습니다** (아래)
 *
 * 파싱 실패는 **예외가 아니라 `undefined`** 입니다 — URL 은 선택 항목이고,
 * 중복 감지를 못 하는 것이 등록을 막을 이유는 아닙니다.
 *
 * ## GitHub 은 한 저장소를 여러 주소로 가리킵니다
 *
 * `github.com/a/b` · `/a/b/tree/main` · `/a/b/blob/main/README.md` · `/a/b.git`
 * 이 전부 **같은 저장소**입니다. 접지 않으면 같은 저장소가 다른 자료가 되고,
 * 중복 감지가 「다르게 쓴 같은 것」을 못 잡습니다 — 이 함수가 존재하는 이유
 * 그대로입니다.
 *
 * 그리고 접은 값이 `DEC-050` 의 **정체성**이 됩니다:
 * `resources(url_normalized) WHERE deleted_at IS NULL AND type='GITHUB_REPO'`
 * 부분 유니크가 그 값을 봅니다.
 *
 * > **타입 분기가 아니라 URL 규칙입니다.** `utm_*` 를 떼는 것과 같은 자리이고,
 * > `GITHUB_REPO` 타입이 아닌 자료가 저장소 주소를 달아도 똑같이 접힙니다 —
 * > 그래야 「AI 자료로 등록한 저장소」와 「GitHub 자료로 등록한 저장소」가
 * > 중복 감지에서 만납니다.
 */
export function normalizeUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const gh = parseGithubUrl(raw);
  if (gh) return `https://github.com/${gh.owner}/${gh.repo}`;
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

/**
 * 유일한 slug 후보를 만든다. 충돌하면 `-2`, `-3` …
 *
 * > **이 조회는 경합을 막지 못합니다.** 트랜잭션 안의 `findUnique` 는 다른
 * > 트랜잭션의 **미커밋 행을 볼 수 없으므로**, 같은 제목을 동시에 등록하면
 * > 둘 다 같은 slug 를 「비어 있다」고 판정하고 뒤엣것이 `P2002` 로 죽습니다
 * > (실측). **최종 방어선은 DB 의 유니크 제약이고**, 호출부가 그것을 잡아 재시도합니다.
 * > 이 루프는 「보기 좋은 번호를 고르는」 일만 합니다.
 */
async function slugCandidate(
  tx: Prisma.TransactionClient,
  title: string,
  type: ResourceType,
  attempt: number
): Promise<string> {
  const base = toSlug(title, type);
  for (let n = 1; n <= 50; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const taken = await tx.resource.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!taken) {
      // 재시도라면 «남이 방금 가져간» 번호이므로 접미사를 붙여 비켜난다
      return attempt === 0 ? slug : `${slug}-${randomSuffix()}`;
    }
  }
  // 50번 부딪히면 제목 기반을 포기한다 — 등록을 막지 않는다
  return `${base}-${randomSuffix()}`;
}

const randomSuffix = () => randomBytes(3).toString("hex");

/**
 * Prisma 의 「유니크 제약 위반」인가 — **어떤 제약인지까지** 본다.
 *
 * > **`meta.target` 이 없습니다.** Prisma 7 을 driver adapter(`@prisma/adapter-pg`)로
 * > 쓰면 P2002 의 `meta` 가 이 모양입니다:
 * > `{ driverAdapterError: { cause: { constraint: { index: "resources_slug_key" } } } }`.
 * > 처음에 `meta.target` 만 보고 짰다가 **재시도가 한 번도 발동하지 않았습니다**
 * > (동시 4건 중 1건만 성공). 어댑터가 없던 시절 문서를 기억한 채로 쓴 결과입니다.
 * >
 * > 그래서 **두 자리를 다 보고, 못 찾으면 「모른다」가 아니라 `false`** 로 둡니다 —
 * > 엉뚱한 제약 위반을 slug 충돌로 오인해 재시도하면 진짜 오류가 숨습니다.
 */
function isUniqueViolation(e: unknown, constraintPart: string): boolean {
  if (typeof e !== "object" || e === null) return false;
  const err = e as {
    code?: string;
    meta?: {
      target?: unknown;
      driverAdapterError?: {
        cause?: { constraint?: { index?: string; fields?: string[] } };
      };
    };
  };
  if (err.code !== "P2002") return false;

  const target = err.meta?.target;
  const cause = err.meta?.driverAdapterError?.cause?.constraint;
  const parts = [
    Array.isArray(target) ? target.join(",") : String(target ?? ""),
    cause?.index ?? "",
    cause?.fields?.join(",") ?? "",
  ];
  return parts.some((p) => p.includes(constraintPart));
}

/**
 * 태그를 만들고 잇는다.
 *
 * `tags.usage_count` 는 **표시용 캐시**(인기 태그)이고 정본은 `resource_tags` 입니다.
 *
 * ## 두 가지를 고쳤습니다 — 둘 다 경합이었고 실측으로 드러났습니다
 *
 * **① `tag.upsert` 가 자료 등록 전체를 실패시켰습니다.** Prisma 의 `upsert` 는
 * `update: {}` 여도 원자적 `INSERT … ON CONFLICT` 로 컴파일되지 **않습니다.**
 * 새 태그 하나를 세 사람이 동시에 쓰면 유니크 위반이 나고, 태그 하나 때문에
 * **자료 등록 트랜잭션 전체가 롤백**됐습니다. `P7` Ingest 가 병렬로 들어오면 상시입니다.
 * → `createMany({ skipDuplicates: true })` 로 바꿉니다. **루프도 사라집니다** —
 * 태그 10개면 질의 30여 개였던 것이 셋이 됩니다.
 *
 * **② `usage_count` 를 「세어서 쓰는」 것이 lost update 였습니다.**
 * 주석에 *"증감이 아니라 세어서 씁니다"* 라고 적어 뒀는데, `count()` → `update()`
 * 사이에 다른 트랜잭션이 끼면 낮은 값으로 덮어씁니다 —
 * **4명이 동시에 같은 태그를 쓰면 `usage_count = 1`, 실제 연결은 4** 였습니다.
 * → 원자적 `increment`/`decrement`. 「인기 태그」가 조용히 낮아지지 않습니다.
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

  // 없는 것만 만든다. 경합에서 유니크 위반 대신 «건너뜀» 이 된다
  if (slugs.length > 0) {
    await tx.tag.createMany({
      data: slugs.map((slug) => ({ slug, label: slug })),
      skipDuplicates: true,
    });
  }
  const tags =
    slugs.length > 0
      ? await tx.tag.findMany({
          where: { slug: { in: slugs } },
          select: { id: true },
        })
      : [];
  const afterIds = new Set(tags.map((t) => t.id));
  const beforeIds = new Set(before.map((b) => b.tagId));

  await tx.resourceTag.deleteMany({ where: { resourceId } });
  if (afterIds.size > 0) {
    await tx.resourceTag.createMany({
      data: [...afterIds].map((tagId) => ({ resourceId, tagId })),
      skipDuplicates: true,
    });
  }

  /*
   * **바뀐 것만 원자적으로 증감합니다.** 그대로 남은 태그는 건드리지 않습니다 —
   * 수정에서 태그를 안 바꿨는데 카운터를 흔들 이유가 없습니다.
   */
  const added = [...afterIds].filter((id) => !beforeIds.has(id));
  const removed = [...beforeIds].filter((id) => !afterIds.has(id));

  if (added.length > 0) {
    await tx.tag.updateMany({
      where: { id: { in: added } },
      data: { usageCount: { increment: 1 } },
    });
  }
  if (removed.length > 0) {
    await tx.tag.updateMany({
      // 음수로 내려가지 않게 — 캐시가 어긋난 적이 있어도 0 밑으로는 안 간다
      where: { id: { in: removed }, usageCount: { gt: 0 } },
      data: { usageCount: { decrement: 1 } },
    });
  }
}

/**
 * **어느 테이블에 쓰는가.** 여섯 줄이고, 각 줄이 델리게이트 하나입니다.
 *
 * 행의 «모양»은 여기 없습니다 — `content-types/<type>/write.ts` 가 만듭니다.
 * 이 표가 아는 것은 **테이블뿐**입니다.
 *
 * > 델리게이트 이름을 타입 폴더에 문자열로 두고 `tx[name]` 으로 부르는 안도
 * > 있었지만, 그건 캐스트가 필요하고 **컬럼 이름 오타가 컴파일 오류가 아니라
 * > 런타임 오류**가 됩니다. 여기서는 `tx.aiMaterial.upsert` 라 타입이 삽니다.
 *
 * `Record<ResourceType, …>` 이라 **일곱 번째 타입을 빠뜨리면 컴파일이 실패합니다.**
 * `schemas.ts`·`writers.ts`·`index.ts` 와 같은 성질입니다 (`REQ-04 · 4.9`).
 */
const DETAIL_UPSERT: {
  [T in ResourceType]: (
    tx: Prisma.TransactionClient,
    resourceId: string,
    row: DetailRow<T>
  ) => Promise<unknown>;
} = {
  AI_MATERIAL: (tx, resourceId, row) =>
    tx.aiMaterial.upsert({
      where: { resourceId },
      create: { resourceId, ...row },
      update: row,
    }),
  GITHUB_REPO: (tx, resourceId, row) =>
    tx.githubRepo.upsert({
      where: { resourceId },
      create: { resourceId, ...row },
      update: row,
    }),
  MCP_SERVER: (tx, resourceId, row) =>
    tx.mcpServer.upsert({
      where: { resourceId },
      create: { resourceId, ...row },
      update: row,
    }),
  SKILL: (tx, resourceId, row) =>
    tx.skill.upsert({
      where: { resourceId },
      create: { resourceId, ...row },
      update: row,
    }),
  DEV_NOTE: (tx, resourceId, row) =>
    tx.devNote.upsert({
      where: { resourceId },
      create: { resourceId, ...row },
      update: row,
    }),
  PROMPT: (tx, resourceId, row) =>
    tx.prompt.upsert({
      where: { resourceId },
      create: { resourceId, ...row },
      update: row,
    }),
};

/**
 * 타입별 상세 테이블에 쓴다 — `resourceId` 가 PK 라 upsert 로 등록·수정을 겸한다.
 *
 * > 전에는 `if (type !== "AI_MATERIAL") throw` 였고 그 아래 여덟 필드의 매핑이
 * > 손으로 적혀 있었습니다. 타입을 다섯 더하면 **그 자리가 분기로 자랐을**
 * > 것이고, `REQ-04 · 4.9` 의 「폴더 하나 + 레지스트리」가 거기서 깨집니다.
 * > 지금 이 함수에는 **타입 이름이 분기로 나오지 않습니다** — 표의 키로만 나옵니다.
 */
async function writeDetail<T extends ResourceType>(
  tx: Prisma.TransactionClient,
  resourceId: string,
  type: T,
  detail: Record<string, unknown>
): Promise<void> {
  /*
   * 두 표를 `type` 으로 함께 조회합니다. **여기가 유니온이 좁혀지는 유일한
   * 자리**이고, 그래서 캐스트도 여기 한 번뿐입니다 — 각 줄 안에서는
   * `row` 가 그 타입의 행이라 컬럼 이름 오타가 컴파일 오류로 잡힙니다.
   */
  const upsert = DETAIL_UPSERT[type] as (
    tx: Prisma.TransactionClient,
    id: string,
    row: DetailRow<T>
  ) => Promise<unknown>;
  await upsert(tx, resourceId, toDetailRow(type, detail));
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
 *
 * > **DB 는 이제 막지 않습니다** (`DEC-047`). 전에는 `url_normalized` 에 부분 유니크가
 * > 있어서 「그대로 등록해도 됩니다」 배너를 누르면 `P2002` 로 죽었습니다 —
 * > 코드·주석·화면은 「막지 않는다」인데 스키마가 막고 있었습니다.
 * >
 * > **중복 정책은 진입점마다 다릅니다.** 웹은 사람이 의식하고 고르지만,
 * > `P7` 의 MCP 는 에이전트가 루프를 돌아 조용히 중복을 만들 수 있어
 * > `API-104` 가 `409 DUPLICATE` 로 거절합니다. **한 DB 제약이 두 정책을 낼 수 없으므로
 * > 정책은 진입점에 둡니다** — service 는 공유하고 거절 여부는 액션·라우트가 정합니다.
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

/**
 * 비밀값이 섞여 들어오면 저장하지 않는다 (`NFR-SEC-008`).
 *
 * **등록과 수정 «둘 다»에서 봅니다.** 등록만 보면 깨끗하게 넣고 나중에
 * 토큰을 붙이는 경로가 열려 있고, 그게 더 흔한 순서입니다(설정 예시를
 * 나중에 채우다가).
 *
 * 걸린 **종류만** 말하고 값은 돌려주지 않습니다 — 이 문구는 응답과 감사
 * 로그에 남으므로, 원문을 실으면 차단하려던 것을 스스로 흘립니다.
 */
function assertNoSecrets(input: ParsedResourceInput): void {
  const found = scanValues(input);
  if (found.length > 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      `비밀값으로 보이는 문자열이 들어 있습니다 (${found.join("·")}). 자료에는 «키 이름과 설명»만 적고 실제 값은 빼 주세요.`
    );
  }
}

/**
 * API-031 자료 등록.
 *
 * **slug 충돌은 재시도합니다.** 같은 제목을 동시에 등록하면 미리 본 빈자리가
 * 남의 것이 되어 `P2002` 가 납니다 — 사용자에게는 이유 없는
 * 「처리 중 문제가 발생했습니다」로 보입니다. 재시도가 정답인 이유는
 * **사용자가 잘못한 것이 없기 때문**입니다.
 */
export async function create(
  actor: Actor,
  input: ParsedResourceInput
): Promise<WriteResult> {
  assertNoSecrets(input);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await createOnce(actor, input, attempt);
    } catch (e) {
      if (attempt < 2 && isUniqueViolation(e, "slug")) continue;
      /*
       * **유니크 위반을 `INTERNAL_ERROR` 로 흘려보내지 않습니다.**
       * `guard()` 가 non-`AppError` 를 「처리 중 문제가 발생했습니다」로 통일하는데,
       * 그건 **사용자가 할 수 있는 일이 없는** 문구입니다. 유니크 위반은
       * 「무엇이 겹쳤는지」를 말할 수 있는 오류이므로 그렇게 말합니다.
       *
       * > **전에는 «어떤» P2002 든 「잠시 후 다시 시도해 주세요」였습니다**
       * > (`isUniqueViolation(e, "")` 는 빈 문자열이라 항상 참). 그 문구가 참인
       * > 것은 **slug 충돌 하나뿐**이고, 그건 이미 위에서 재시도합니다.
       * > 나머지 제약은 **재시도로 절대 풀리지 않습니다** — 사용자는 같은 버튼을
       * > 계속 누르게 됩니다. 제약마다 «할 수 있는 일»을 말합니다.
       */
      if (isUniqueViolation(e, "github_url")) {
        throw new AppError(
          "DUPLICATE",
          "이 저장소는 이미 등록돼 있습니다. 같은 저장소를 두 번 두면 아카이브와 메타 갱신이 두 벌 돌고 어느 쪽이 최신인지 알 수 없습니다. 관점이 다르다면 기존 자료를 수정하거나 «관련» 으로 이어 주세요."
        );
      }
      if (isUniqueViolation(e, "slug")) {
        // 재시도 3번을 다 쓴 경우 — 여기서는 「다시」가 실제로 도움이 된다
        throw new AppError(
          "DUPLICATE",
          "같은 제목이 동시에 등록되고 있습니다. 잠시 후 다시 시도해 주세요."
        );
      }
      throw e;
    }
  }
  // 위 루프는 반드시 반환하거나 던진다. 타입을 위해 남긴다.
  throw new AppError("INTERNAL_ERROR", "자료를 등록하지 못했습니다.");
}

async function createOnce(
  actor: Actor,
  input: ParsedResourceInput,
  attempt: number
): Promise<WriteResult> {
  return db.$transaction(async (tx) => {
    const slug = await slugCandidate(tx, input.title, input.type, attempt);
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
  assertNoSecrets(input);
  return db.$transaction(async (tx) => {
    const target = await tx.resource.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, slug: true, type: true, authorId: true, title: true },
    });
    if (!target) throw new AppError("NOT_FOUND", "자료를 찾을 수 없습니다.");

    /*
     * 🔄 「`MEMBER` 는 남의 자료를 못 고친다」가 여기 있었습니다. `DEC-077` 로
     *    등급이 사라져 조건이 참이 됐습니다 — **로그인한 사람이면 누구나** 고칩니다.
     *    남는 것은 아래 「타입은 못 바꾼다」이고, 그건 권한이 아니라 표의 문제입니다.
     */
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
