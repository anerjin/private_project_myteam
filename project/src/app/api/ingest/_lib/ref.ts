import "server-only";

import type { ResourceType } from "@prisma/client";

import { getContentType } from "@/features/resources/content-types";
import { env } from "@/lib/env";

/**
 * 「자료 한 개를 가리키는 모양」 — Ingest 응답 어디서나 이 한 벌입니다.
 *
 * `API-103`(중복 확인)과 `API-104`(등록 거절)가 **같은 것**을 가리키므로
 * 모양도 같아야 합니다. 각자 객체 리터럴을 적으면 한쪽에만 `url` 이 생기는
 * 식으로 갈립니다 — 그리고 그 차이는 에이전트 쪽에서만 드러납니다.
 *
 * **`url` 은 절대 주소입니다** (`DEV-05 · 5.11` 규칙 표: 「사람이 바로 열어
 * 확인할 수 있어야 한다」). 상대 경로는 CLI 로그에서 못 엽니다.
 */
export interface ResourceRef {
  id: string;
  slug: string;
  type: ResourceType;
  title: string;
  url: string;
}

export function resourceRef(r: {
  id: string;
  slug: string;
  type: ResourceType;
  title: string;
}): ResourceRef {
  return {
    id: r.id,
    slug: r.slug,
    type: r.type,
    title: r.title,
    url: resourceUrl(r.type, r.slug),
  };
}

/** 화면 주소 — 세그먼트는 콘텐츠 타입 정의가 가진 `slug` 입니다 */
export function resourceUrl(type: ResourceType, slug: string): string {
  const base = env.APP_URL.replace(/\/$/, "");
  return `${base}/resources/${getContentType(type).slug}/${slug}`;
}
