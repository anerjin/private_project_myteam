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

/**
 * 오른쪽 열의 타입 전용 블록. **없는 타입이 대부분**이라 `null` 이 정상입니다.
 * 여기도 분기는 없습니다 — 레지스트리에 있으면 붙고 없으면 안 붙습니다.
 */
export function TypeAside({ resource }: { resource: Resource }) {
  const { Aside } = getContentType(resource.type);
  return Aside ? <Aside resource={resource} /> : null;
}
