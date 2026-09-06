import { notFound } from "next/navigation";

import { DocsBoard } from "@/features/projects/components/docs-board";
import { sectionBySlug } from "@/features/projects/schema";
import { AppError } from "@/lib/errors";
import { decodeSegment } from "@/lib/route-params";
import { requireActiveUser } from "@/server/auth/guards";
import * as docService from "@/server/services/project-doc.service";
import * as projectService from "@/server/services/project.service";

/**
 * 구획별 문서 (`FR-PROJ-005`~`009`).
 *
 * **여는 문서는 `?doc=<id>` 로 옵니다.** 나의 노트와 같은 형태입니다 —
 * 그 id 가 이 구획의 것인지는 **서버가 보고** 골라 넘깁니다. 목록에서 찾아
 * 쓰게 두면 목록에 없는 남의 id 를 넣었을 때 무슨 일이 일어나는지가 화면
 * 코드에 숨습니다.
 */
export default async function ProjectDocsPage({
  params,
  searchParams,
}: PageProps<"/projects/[slug]/docs/[section]">) {
  await requireActiveUser();
  // 한국어 slug 는 인코딩된 채로 옵니다 (`lib/route-params`)
  const { slug: rawSlug, section: sectionSlug } = await params;
  const slug = decodeSegment(rawSlug);
  const sp = await searchParams;

  const section = sectionBySlug(sectionSlug);
  // 없는 구획은 **없는 주소**입니다 — 빈 목록으로 그리면 오타를 못 알아챕니다
  if (!section) notFound();

  let project;
  try {
    project = await projectService.getBySlug(slug);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }

  const docs = await docService.listFor(project.id, section.value);

  const wanted = typeof sp.doc === "string" ? sp.doc : undefined;
  /*
   * **이 구획에 있는 것만** 엽니다. 없는 id 와 남의 id 를 같이 다룹니다 —
   * 구별해서 답하면 「그 id 는 존재한다」가 새어 나갑니다.
   */
  const selected =
    wanted && docs.some((d) => d.id === wanted)
      ? await docService.get(wanted)
      : null;

  return (
    <DocsBoard
      projectId={project.id}
      projectSlug={project.slug}
      section={section.value}
      sectionSlug={section.slug}
      sectionLabel={section.label}
      docs={docs}
      selected={selected}
      missing={Boolean(wanted && !selected)}
    />
  );
}
