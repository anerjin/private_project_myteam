import { listContentTypes } from "@/features/resources/content-types";
import { collections, members, resources } from "@/mocks";

/**
 * 브레드크럼의 **동적 세그먼트** 라벨 맵.
 * `/resources/mcp-server/filesystem-mcp` 처럼 URL 조각이 slug·id 인 자리를
 * 사람이 읽는 이름으로 바꾸기 위해 서버 레이아웃에서 만들어 넘긴다.
 * 정적 세그먼트는 `config/navigation.ts` 의 `SEGMENT_LABEL` 이 담당한다.
 *
 * 여러 도메인의 데이터를 엮으므로 feature 가 아니라 app 계층에 둔다 (DEV-06 · 6.9절).
 */
export function serviceBreadcrumbLabels(): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const type of listContentTypes()) labels[type.slug] = type.label;
  for (const collection of collections) labels[collection.slug] = collection.name;
  for (const resource of resources) labels[resource.slug] = resource.title;
  return labels;
}

export function adminBreadcrumbLabels(): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const member of members) labels[member.id] = member.name;
  return labels;
}
