import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { ResourceBrowser } from "@/features/resources/components/resource-browser";
import {
  getContentTypeBySlug,
  listContentTypes,
} from "@/features/resources/content-types";
import { resources } from "@/mocks";

export async function generateStaticParams() {
  return listContentTypes().map((t) => ({ type: t.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/resources/[type]">): Promise<Metadata> {
  const { type } = await params;
  return { title: getContentTypeBySlug(type)?.label ?? "자료" };
}

/** SCR-111 자료 목록 (타입별) — 타입이 늘어도 이 파일 하나가 처리한다 */
export default async function ResourceTypePage({
  params,
}: PageProps<"/resources/[type]">) {
  const { type } = await params;
  const meta = getContentTypeBySlug(type);
  if (!meta) notFound();

  const list = resources.filter((r) => r.type === meta.code);

  return (
    <>
      <PageHeader
        description={meta.description}
        count={list.length}
        action={
          <Button asChild>
            <Link href="/resources/new">
              <Plus className="size-4" />
              자료 등록
            </Link>
          </Button>
        }
      />
      <ResourceBrowser resources={list} />
    </>
  );
}
