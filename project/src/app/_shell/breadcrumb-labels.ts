import { headers } from "next/headers";

import { listContentTypes } from "@/features/resources/content-types";
import { PATHNAME_HEADER } from "@/proxy";
import { db } from "@/lib/db";

/**
 * 브레드크럼의 **동적 세그먼트** 라벨 맵.
 * `/resources/mcp-server/filesystem-mcp` 처럼 URL 조각이 slug·id 인 자리를
 * 사람이 읽는 이름으로 바꾸기 위해 서버 레이아웃에서 만들어 넘긴다.
 * 정적 세그먼트는 `config/navigation.ts` 의 `SEGMENT_LABEL` 이 담당한다.
 *
 * 여러 도메인의 데이터를 엮으므로 feature 가 아니라 app 계층에 둔다 (DEV-06 · 6.9절).
 *
 * ## **지금 경로에 있는 것만** 조회합니다
 *
 * 전에는 전체 자료·컬렉션·회원의 맵을 만들었습니다. 목 데이터일 때는 공짜였지만
 * **1만 건이면 매 요청 1만 행을 읽어 그중 하나를 씁니다.**
 * 경로를 `proxy` 가 헤더로 알려 주므로(`PATHNAME_HEADER`) 마지막 세그먼트 하나만 찾습니다.
 *
 * 못 찾으면 **아무것도 넣지 않습니다** — 빵부스러기는 원래 세그먼트를 그대로 보여줍니다.
 * 「알 수 없음」 같은 자리표시자를 넣으면 그게 제목인 줄 압니다.
 */

async function currentSegments(): Promise<string[]> {
  const h = await headers();
  const pathname = h.get(PATHNAME_HEADER) ?? "";
  return pathname.split("/").filter(Boolean);
}

export async function serviceBreadcrumbLabels(): Promise<
  Record<string, string>
> {
  const labels: Record<string, string> = {};
  // 콘텐츠 타입은 레지스트리에 있는 «상수»라 조회가 필요 없다
  for (const type of listContentTypes()) labels[type.slug] = type.label;

  const segments = await currentSegments();
  const last = segments[segments.length - 1];
  if (!last || labels[last]) return labels;

  // `/resources/{type}/{slug}` · `/collections/{slug}` 둘 다 마지막이 slug 다
  if (segments[0] === "resources" && segments.length >= 3) {
    const r = await db.resource.findUnique({
      where: { slug: last },
      select: { title: true },
    });
    if (r) labels[last] = r.title;
  } else if (segments[0] === "collections" && segments.length >= 2) {
    const c = await db.collection.findUnique({
      where: { slug: last },
      select: { name: true },
    });
    if (c) labels[last] = c.name;
  }

  return labels;
}

export async function adminBreadcrumbLabels(): Promise<Record<string, string>> {
  const segments = await currentSegments();
  const last = segments[segments.length - 1];
  // `/admin/members/{id}` — 여기만 동적 세그먼트다
  if (segments[0] !== "admin" || segments[1] !== "members" || !last) return {};

  const member = await db.user.findUnique({
    where: { id: last },
    select: { name: true },
  });
  return member ? { [last]: member.name } : {};
}
