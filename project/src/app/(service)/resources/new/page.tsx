import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { QuickAddUrl } from "@/features/resources/components/quick-add-url";
import { ResourceForm } from "@/features/resources/components/resource-form";
import { RESOURCE_TYPES } from "@/features/resources/list.schema";
import { requireActiveUser } from "@/server/auth/guards";
import type { ResourceType } from "@/types";

export const metadata: Metadata = { title: "자료 등록" };

/**
 * SCR-113 자료 등록.
 *
 * **`?url=`·`?type=` 을 받습니다** — 「URL 빠른 등록」(`FR-RES-005`)이 붙여넣은
 * 값과 추정한 타입을 여기로 넘깁니다. `searchParams` 는 사용자 입력이므로
 * 타입은 열거로 좁히고, 아니면 없는 것으로 떨어뜨립니다.
 */
export default async function NewResourcePage({
  searchParams,
}: PageProps<"/resources/new">) {
  // 인가는 레이아웃이 아니라 page 가 한다 (DEC-035)
  await requireActiveUser();

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

  const rawType = one(sp.type);
  const initialType = RESOURCE_TYPES.includes(rawType as ResourceType)
    ? (rawType as ResourceType)
    : undefined;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader description="타입을 고르면 그에 맞는 입력 항목이 나타납니다." />
      {/* URL 빠른 등록(FR-RES-005). 사이드바에서 이 화면으로 넘어옵니다. */}
      <QuickAddUrl />
      <ResourceForm initialUrl={one(sp.url)} initialType={initialType} />
    </div>
  );
}
