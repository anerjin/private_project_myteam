import { getContentType } from "@/features/resources/content-types";
import type { Resource } from "@/types";

/**
 * 타입별 상세 블록을 레지스트리에서 찾아 렌더한다.
 * **여기에 타입 분기를 두지 않는다.** 새 타입이 생기면 자동으로 붙는다.
 */
export function TypeDetail({ resource }: { resource: Resource }) {
  const { Detail } = getContentType(resource.type);
  return <Detail resource={resource} />;
}
