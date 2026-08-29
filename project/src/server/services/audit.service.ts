import "server-only";

import type { Prisma } from "@prisma/client";

import type { AuditAction } from "@/features/audit/actions";
import { db } from "@/lib/db";
import type { Actor } from "@/server/auth/actor";

/**
 * 감사 로그 (FR-AUDIT-001, REQ-02 · 2.10절).
 *
 * ## 트랜잭션을 주면 본 작업과 운명을 같이합니다 (`DEC-043`, `DEC-038` 개정)
 *
 * 전에는 **모든** 기록이 실패를 삼켰습니다. 근거는 「승인이 성공했는데 로그를 못
 * 남겼다고 승인을 취소하면 사용자가 더 곤란해진다」였는데, 그 판단은 **트랜잭션이
 * 없는 인증 경로**의 것이었습니다. 로그인은 로그를 못 남겼다고 막으면 서비스가 죽습니다.
 *
 * 회원 상태 전이는 다릅니다. **되돌려도 관리자가 다시 누르면 그만**이고, 사용자는
 * 롤백된 승인을 본 적이 없습니다. 반대로 커밋 직후 DB 가 죽어 로그만 사라지면
 * **그것이 감사 추적이 가장 필요한 순간**입니다 (`FR-AUDIT-001` 「예외 없이 기록」).
 *
 * 그래서 규칙은 하나입니다 — **`tx` 를 주면 던지고, 안 주면 삼킨다.**
 * 함수를 두 개로 나누면 「어느 쪽을 부를지」가 두 번째 규칙이 됩니다.
 *
 * **알림은 여전히 트랜잭션 밖입니다** (`DEC-038` 유지) — 일괄 승인에서
 * advisory 락을 오래 잡지 않기 위해서입니다.
 *
 * **비밀번호·API 키 원문은 절대 넣지 않습니다** (`NFR-PRIV-004`).
 */

/**
 * 행위 목록은 `features/audit/actions.ts` 에 있습니다.
 *
 * **여기 두면 화면이 못 읽습니다** (`server-only`). 필터의 선택지를 화면에
 * 다시 적으면 행위를 추가한 사람이 한쪽을 빠뜨리고, 그 행위는 **기록은 되는데
 * 필터로는 영원히 못 찾는** 상태가 됩니다.
 */
export { AUDIT_ACTIONS, type AuditAction } from "@/features/audit/actions";

export interface AuditInput {
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  /** 사람이 읽는 한 줄. 목록에서 이것만 보고도 무슨 일인지 알아야 한다 */
  summary: string;
  /** `{ field: { before, after } }` */
  diff?: Prisma.InputJsonValue;
}

/**
 * 행위자가 있는 기록.
 *
 * `actorUsername` 을 **스냅샷으로 함께 저장**합니다. 계정이 익명화돼도
 * 「누가 했는지」가 남아야 합니다 (`DEC-021`, `DEV-02 · TBL-audit_logs`).
 */
/**
 * 트랜잭션 안에서 기록한다. **본 작업과 운명을 같이합니다** (`DEC-043`).
 *
 * `tx` 가 **필수**인 것이 이 함수의 요점입니다. 선택 인자로 두었더니
 * 같은 커밋 안에서 회원 전이에는 넣고 API 키에는 빠뜨렸습니다 —
 * **빠뜨려도 컴파일되는 규칙은 반드시 절반에서 빠집니다** (`DEC-044` 가 없앤 그 형태).
 */
export async function log(
  actor: Actor,
  input: AuditInput,
  tx: Prisma.TransactionClient
): Promise<void> {
  await tx.auditLog.create({ data: toRow(actor, input) });
}

/**
 * 트랜잭션 «없이» 기록하고, **실패를 삼킵니다** (`DEC-043`).
 *
 * **이름이 곧 사유 요구입니다** — 이 함수가 보이면 「왜 트랜잭션 밖인가」를
 * 묻게 됩니다. 정당한 자리는 **되돌릴 본 작업이 없는 인증 경로**뿐입니다:
 * 로그인 성공·실패·차단·로그아웃. 로그를 못 남겼다고 로그인을 막으면
 * DB 가 흔들릴 때 서비스가 통째로 죽습니다.
 */
export async function logDetached(
  actor: Actor,
  input: AuditInput
): Promise<void> {
  try {
    await db.auditLog.create({ data: toRow(actor, input) });
  } catch (e) {
    console.error("[audit] 기록 실패 — 본 작업은 유지됩니다:", input.action, e);
  }
}

export interface AuditPage {
  items: {
    id: string;
    actorUsername: string;
    via: "WEB" | "MCP";
    action: string;
    targetType: string | null;
    summary: string;
    ip: string | null;
    diff: unknown;
    createdAt: Date;
  }[];
  total: number;
}

/**
 * 이 목록이 무엇으로 좁혀지는가 (`FR-AUDIT-002`: 기간·행위자·행위 유형).
 *
 * **`targetId` 는 요구사항에 없지만 여기 있습니다** — 회원 상세의
 * 「상태 변경 이력」(`FR-ADM-003`)이 *그 회원에게 일어난 일*을 물어야 하고,
 * 그것은 같은 표를 다른 각도로 보는 것뿐입니다. 화면마다 질의를 따로 쓰면
 * 감사 로그를 읽는 경로가 둘이 되고, 한쪽만 인가를 갖게 됩니다.
 */
export interface AuditFilter {
  /** 행위자 아이디 (`actor_username` 스냅샷과 정확히 일치) */
  actor?: string;
  action?: AuditAction;
  via?: "WEB" | "MCP";
  /** 이 날부터 (`YYYY-MM-DD`, 포함) */
  from?: string;
  /** 이 날까지 (`YYYY-MM-DD`, **그날 전체를 포함**) */
  to?: string;
  /** 이 대상에게 일어난 일만 */
  targetId?: string;
}

/**
 * 필터 → `where`.
 *
 * **`to` 는 그날 «끝»까지입니다.** `2026-08-29` 를 `<= 2026-08-29T00:00Z` 로
 * 읽으면 그날 하루가 통째로 빠지고, 관리자는 「오늘 것이 안 보인다」를 겪습니다 —
 * 날짜 한 칸을 넣었을 때 0건이 나오는 필터는 **없는 것보다 나쁩니다.**
 */
function toWhere(filter: AuditFilter): Prisma.AuditLogWhereInput {
  const createdAt: Prisma.DateTimeFilter = {};
  if (filter.from) createdAt.gte = new Date(`${filter.from}T00:00:00.000Z`);
  if (filter.to) createdAt.lte = new Date(`${filter.to}T23:59:59.999Z`);

  return {
    ...(filter.actor ? { actorUsername: filter.actor } : {}),
    ...(filter.action ? { action: filter.action } : {}),
    ...(filter.via ? { via: filter.via } : {}),
    ...(filter.targetId ? { targetId: filter.targetId } : {}),
    ...(createdAt.gte || createdAt.lte ? { createdAt } : {}),
  };
}

/**
 * 감사 로그 조회 (`FR-AUDIT-002`).
 *
 * **P3 가 감사 로그를 트랜잭션 필수로 만들었는데 읽을 방법이 없었습니다** —
 * 두 페이즈 동안 write-only 였습니다. 알림 행에 대해 「읽는 화면 없이 쓰지
 * 않는다」고 정한 것과 같은 상황이라 여기서 읽기 경로를 붙입니다.
 *
 * 필터는 **같은 `where` 를 세는 데도 씁니다** — 총 건수가 필터를 안 보면
 * 「120건 중 3페이지」인데 2페이지가 비는 일이 생깁니다.
 */
export async function list(page: {
  page: number;
  size: number;
  filter?: AuditFilter;
}): Promise<AuditPage> {
  const where = toWhere(page.filter ?? {});
  const [items, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      select: {
        id: true,
        actorUsername: true,
        via: true,
        action: true,
        targetType: true,
        summary: true,
        ip: true,
        diff: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page.page - 1) * page.size,
      take: page.size,
    }),
    db.auditLog.count({ where }),
  ]);

  return {
    // DB 의 `null` 을 화면이 매번 처리하지 않도록 경계에서 한 번 메운다
    items: items.map((l) => ({
      ...l,
      actorUsername: l.actorUsername ?? "(알 수 없음)",
      summary: l.summary ?? l.action,
    })),
    total,
  };
}

/**
 * 행위자 필터의 선택지 (`FR-AUDIT-002`).
 *
 * **`users` 가 아니라 `audit_logs` 에서 뽑습니다.** 로그는 `actor_username` 을
 * **스냅샷으로** 갖고 있어(`DEC-021` 익명화 대비) 탈퇴·익명화된 사람의 기록도
 * 남습니다 — 회원 목록에서 뽑으면 그 사람들이 선택지에서 사라지고,
 * **정확히 그들의 기록을 찾고 싶을 때** 필터가 답을 못 냅니다.
 *
 * 계정 50개 이하(`REQ-01 · 1.7`)라 `distinct` 한 번이면 됩니다.
 */
export async function listActors(): Promise<string[]> {
  const rows = await db.auditLog.findMany({
    where: { actorUsername: { not: null } },
    distinct: ["actorUsername"],
    select: { actorUsername: true },
    orderBy: { actorUsername: "asc" },
  });
  return rows.flatMap((r) => (r.actorUsername ? [r.actorUsername] : []));
}

function toRow(actor: Actor, input: AuditInput) {
  return {
    actorId: actor.id,
    actorUsername: actor.username,
    via: actor.via,
    apiKeyId: actor.apiKeyId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    summary: input.summary,
    diff: input.diff,
    ip: actor.ip,
    userAgent: actor.userAgent,
  };
}

/**
 * 행위자가 없는 기록 (로그인 실패 등).
 *
 * `actor_id` 는 NULL 이지만 **시도한 아이디는 남깁니다** — 무차별 대입을
 * 추적하려면 어떤 아이디가 두들겨 맞았는지 알아야 합니다.
 */
export async function logAnonymous(
  input: AuditInput & {
    attemptedUsername?: string;
    ip?: string;
    userAgent?: string;
  }
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorUsername: input.attemptedUsername,
        via: "WEB",
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        summary: input.summary,
        ip: input.ip,
        userAgent: input.userAgent,
      },
    });
  } catch (e) {
    console.error("[audit] 익명 기록 실패:", input.action, e);
  }
}
