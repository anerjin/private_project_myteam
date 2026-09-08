import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { ResourceForm } from "@/features/resources/components/resource-form";
import { getContentTypeBySlug } from "@/features/resources/content-types";
import { AppError } from "@/lib/errors";
import { requireActiveUser } from "@/server/auth/guards";
import * as categoryService from "@/server/services/category.service";
import * as resourceService from "@/server/services/resource.service";
import { decodeSegment } from "@/lib/route-params";

export async function generateMetadata({
  params,
}: PageProps<"/resources/[type]/[slug]/edit">): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeSegment(rawSlug);
  try {
    const r = await resourceService.getBySlug(slug);
    return { title: `${r.title} 수정` };
  } catch {
    return { title: "자료 수정" };
  }
}

/** SCR-113 자료 수정 */
export default async function EditResourcePage({
  params,
}: PageProps<"/resources/[type]/[slug]/edit">) {
  // 인가는 화면 진입에서도 확인한다. 버튼을 숨기는 것만으로는 인가가 아니다 (REQ-02 · 2.1절)
  const session = await requireActiveUser();

  const { type, slug: rawSlug } = await params;
  const slug = decodeSegment(rawSlug);
  const meta = getContentTypeBySlug(type);
  if (!meta) notFound();

  let resource;
  try {
    resource = await resourceService.getBySlug(slug, session.userId);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  if (resource.type !== meta.code) notFound();

  /*
   * 🔄 `canEditResource(actor, resource.author.id)` 가 아니면 `/403` 으로 보냈습니다.
   *    `DEC-077` 로 그 판정이 사라졌습니다 — **남의 자료도 고칩니다.**
   *    남은 문은 위의 `requireActiveUser()` 이고, 실제 차단은 `resource.write` 가 합니다.
   */

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      {/* 경로(자료 › 타입 › 제목 › 수정)는 헤더 빵부스러기가 보여 준다 */}
      <PageHeader
        description={`${resource.title} · 마지막 수정 ${resource.updatedAt.slice(0, 10)} · 등록자 ${resource.author.name}`}
      />

      <ResourceForm
        resource={resource}
        categories={await categoryService.listChoices()}
      />
    </div>
  );
}
