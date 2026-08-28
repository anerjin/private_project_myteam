import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { canEditResource, getMockSession } from "@/features/auth/mock-session";

import { PageHeader } from "@/components/common/page-header";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
  const resource = resources.find((r) => r.slug === slug && r.type === meta?.code);
  if (!meta || !resource) notFound();

  // 인가는 화면 진입에서도 확인한다. 버튼을 숨기는 것만으로는 인가가 아니다 (REQ-02 · 2.1절)
  const session = await getMockSession();
  if (!canEditResource(session, resource.author.id)) redirect("/403");

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/resources/${meta.slug}`}>{meta.label}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/resources/${meta.slug}/${resource.slug}`}>
                <span className="inline-block max-w-[20ch] truncate align-bottom">
                  {resource.title}
                </span>
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>수정</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title="자료 수정"
        description={`마지막 수정 ${resource.updatedAt.slice(0, 10)} · 등록자 ${resource.author.name}`}
      />

      <ResourceForm resource={resource} />
    </div>
  );
}
