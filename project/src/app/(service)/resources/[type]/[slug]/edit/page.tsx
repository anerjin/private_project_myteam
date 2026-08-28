import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { canEditResource } from "@/server/auth/actor";
import { requireActiveUser, toActor } from "@/server/auth/guards";

import { PageHeader } from "@/components/common/page-header";
import { ResourceForm } from "@/features/resources/components/resource-form";
import { getContentTypeBySlug } from "@/features/resources/content-types";
import { resources } from "@/mocks";

export async function generateMetadata({
  params,
}: PageProps<"/resources/[type]/[slug]/edit">): Promise<Metadata> {
  const { slug } = await params;
  const r = resources.find((x) => x.slug === slug);
  return { title: r ? `${r.title} 수정` : "자료 수정" };
}

/** SCR-113 자료 수정 */
export default async function EditResourcePage({
  params,
}: PageProps<"/resources/[type]/[slug]/edit">) {
  const { type, slug } = await params;
  const meta = getContentTypeBySlug(type);
  const resource = resources.find(
    (r) => r.slug === slug && r.type === meta?.code
  );
  if (!meta || !resource) notFound();

  // 인가는 화면 진입에서도 확인한다. 버튼을 숨기는 것만으로는 인가가 아니다 (REQ-02 · 2.1절)
  const session = await requireActiveUser();
  if (!canEditResource(toActor(session), resource.author.id)) redirect("/403");

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      {/* 경로(자료 › 타입 › 제목 › 수정)는 헤더 빵부스러기가 보여 준다 */}
      <PageHeader
        description={`${resource.title} · 마지막 수정 ${resource.updatedAt.slice(0, 10)} · 등록자 ${resource.author.name}`}
      />

      <ResourceForm resource={resource} />
    </div>
  );
}
