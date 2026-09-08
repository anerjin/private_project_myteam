import { Eye, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MarkdownViewer } from "@/components/common/markdown-viewer";
import {
  TableOfContents,
  extractToc,
} from "@/components/common/table-of-contents";
import { TypeBadge } from "@/features/resources/components/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireActiveUser, toActor } from "@/server/auth/guards";
import { AUDIT_ACTION_LABEL } from "@/features/audit/actions";
import { AddToCollection } from "@/features/collections/components/add-to-collection";
import { Attachments } from "@/features/resources/components/attachments";
import { DeleteResourceDialog } from "@/features/resources/components/delete-resource-dialog";
import { ExternalLinkButton } from "@/features/resources/components/external-link-button";
import { GithubPanel } from "@/features/resources/components/github-panel";
import { LinkedResources } from "@/features/resources/components/linked-resources";
import { ResourceHistory } from "@/features/resources/components/resource-history";
import { RepoBrowser } from "@/features/resources/components/repo-browser";
import { WebArchivePanel } from "@/features/resources/components/web-archive-panel";
import {
  TypeAside,
  TypeDetail,
} from "@/features/resources/components/type-detail";
import {
  getContentType,
  getContentTypeBySlug,
} from "@/features/resources/content-types";
import { ResourceActions } from "@/features/resources/components/resource-actions";
import { AppError } from "@/lib/errors";
import * as audit from "@/server/services/audit.service";
import * as collectionService from "@/server/services/collection.service";
import * as fileService from "@/server/services/file.service";
import * as githubService from "@/server/services/github.service";
import * as relationService from "@/server/services/relation.service";
import * as resourceService from "@/server/services/resource.service";
import { decodeSegment } from "@/lib/route-params";

export async function generateMetadata({
  params,
}: PageProps<"/resources/[type]/[slug]">): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeSegment(rawSlug);
  try {
    const r = await resourceService.getBySlug(slug);
    return { title: r.title };
  } catch {
    return { title: "자료" };
  }
}

/** SCR-112 자료 상세 */
export default async function ResourceDetailPage({
  params,
}: PageProps<"/resources/[type]/[slug]">) {
  const session = await requireActiveUser();

  const { type, slug: rawSlug } = await params;
  const slug = decodeSegment(rawSlug);
  const meta = getContentTypeBySlug(type);
  if (!meta) notFound();

  /*
   * 서비스는 `NOT_FOUND` 를 던지고 **화면이 `notFound()` 로 바꿉니다** —
   * service 가 `next/navigation` 을 알면 워커·Ingest 에서 재사용할 수 없습니다
   * (`DEV-06 · 6.6`: service 는 요청 컨텍스트에 의존하지 않는다).
   */
  let resource;
  try {
    resource = await resourceService.getBySlug(slug, session.userId);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  // 경로의 타입과 자료의 타입이 다르면 잘못된 주소다
  if (resource.type !== meta.code) notFound();

  // 카테고리 이름은 자료와 «같은 행»에서 온다 — slug→이름 표를 두면 그게 목이 된다
  const category = resource.category
    ? {
        slug: resource.category,
        name: resource.categoryName ?? resource.category,
      }
    : undefined;
  const toc = resource.body ? extractToc(resource.body) : [];

  const actor = await toActor(session);
  const [related, attachments, linked, collections] = await Promise.all([
    resourceService.findRelated(resource.id, resource.tags),
    fileService.listFor(resource.id),
    relationService.listFor(resource.id),
    // 「어디에 담을 수 있고 이미 담겼는가」를 한 번에 (`FR-COLL-004`)
    collectionService.listForPicker(actor, resource.id),
  ]);

  /*
   * 파일 목록·README 는 **GitHub 자료일 때만** 읽습니다. `readme_content` 는
   * 최대 200KB 라 목록 select 에서 뺐고(`RESOURCE_CARD_SELECT`), 여기서
   * 필요할 때만 한 번 더 읽습니다.
   */
  const repo =
    resource.detail.type === "GITHUB_REPO"
      ? await githubService.repoView(resource.id)
      : null;

  /*
   * **GitHub 이 아닌 자료도 보관합니다** (`REQ-01 · 1.1`). 문서 사이트·논문이
   * 사라지면 남는 것이 요약 한 줄뿐이던 자리입니다. 저장소는 소스를 받고,
   * 나머지는 **그 페이지 자체**(MHTML)를 받습니다.
   */
  const webArchive =
    resource.detail.type !== "GITHUB_REPO" && resource.url
      ? await githubService.archivedFile(resource.id)
      : null;

  /*
   * 변경 이력 (`FR-RES-013`).
   *
   * 🔄 **「고칠 수 있는 사람에게만」이었습니다** — 그 판정(`canEditResource`)이
   *    `DEC-077` 로 사라져 조건 없이 읽습니다. 겨누던 위험(「아무나 보면 누가
   *    무엇을 하는지 새어 나간다」)은 **보는 사람이 한 명이면 성립하지 않습니다.**
   */
  const history = await audit.list({
    page: 1,
    size: 10,
    filter: { targetId: resource.id },
  });

  return (
    <>
      {/* 자료 제목과 경로는 헤더 빵부스러기가 보여 준다 (DEV-03 · 3.4절) */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <TypeBadge type={resource.type} />
              {resource.sourceChannel === "MCP" && (
                <span className="text-muted-foreground font-mono text-xs">
                  CLI 수집
                </span>
              )}
            </div>
            {resource.summary && (
              <p className="text-muted-foreground">{resource.summary}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {resource.url && <ExternalLinkButton url={resource.url} />}
            <ResourceActions
              resourceId={resource.id}
              bookmarked={resource.bookmarked ?? false}
              bookmarkCount={resource.bookmarkCount}
            />
            <AddToCollection
              resourceId={resource.id}
              collections={collections}
            />
            {/*
              🔄 여기 `canEdit ? … : 「다른 사람이 등록한 자료입니다」` 가 있었습니다.
                 `DEC-077` 로 남의 자료도 고칠 수 있게 되어 **한쪽만 남았습니다.**
            */}
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/resources/${meta.slug}/${resource.slug}/edit`}>
                  <Pencil className="size-4" />
                  수정
                </Link>
              </Button>
              <DeleteResourceDialog resource={resource} />
            </div>
          </div>

          <TypeDetail resource={resource} />

          {resource.body && (
            <Card>
              <CardContent className="p-6">
                <MarkdownViewer content={resource.body} />
              </CardContent>
            </Card>
          )}

          {/*
            **저장소 첫 화면** — 파일 목록과 README (`FR-GH-002`).

            타입 폴더가 아니라 여기 있는 이유: 이 둘은 **DB 를 한 번 더 읽어야**
            하고(`repoView`), 타입 폴더는 화면 컴포넌트와 같은 자리라 서비스를
            부르지 않습니다. `Detail` 의 계약(`Resource` 하나만 받는 순수 표현)도
            벗어납니다 — `GithubPanel` 이 여기 있는 것과 같은 이유입니다.
          */}
          {repo && resource.detail.type === "GITHUB_REPO" && (
            <RepoBrowser
              owner={resource.detail.owner}
              repo={resource.detail.repo}
              defaultBranch={resource.detail.defaultBranch}
              files={repo.files}
              readme={repo.readme}
              isGone={resource.detail.isGone}
            />
          )}

          <LinkedResources resourceId={resource.id} items={linked} />

          <Attachments resourceId={resource.id} files={attachments} />

          <ResourceHistory
            entries={history.items.map((l) => ({
              id: l.id,
              // 라벨을 여기서 붙입니다 — 조립은 app 계층 (`DEV-06 · 6.9`)
              actionLabel:
                AUDIT_ACTION_LABEL[
                  l.action as keyof typeof AUDIT_ACTION_LABEL
                ] ?? l.action,
              summary: l.summary,
              actorUsername: l.actorUsername,
              via: l.via,
              createdAt: l.createdAt.toISOString(),
            }))}
          />
        </div>

        <aside className="space-y-4">
          {toc.length >= 2 && <TableOfContents items={toc} />}

          {/*
            **타입 전용 곁다리** — GitHub 이면 「저장소 정보」입니다.
            레지스트리에 `Aside` 가 있는 타입만 붙습니다(`TypeAside`).
          */}
          <TypeAside resource={resource} />

          {/*
            GitHub 자료만의 조작 — 메타 갱신·아카이브·내려받기 (`FR-GH-003`~`005`).
            **서버 작업을 부르는 버튼**이라 `Aside` 컴포넌트의 계약을 벗어납니다.
          */}
          {resource.detail.type === "GITHUB_REPO" && (
            <GithubPanel
              resourceId={resource.id}
              archiveStatus={resource.detail.archiveStatus}
              archiveSizeBytes={resource.detail.archiveSizeBytes}
              archivedSha={resource.detail.archivedSha}
              isGone={resource.detail.isGone}
            />
          )}

          {/* 저장소가 아닌 자료 — 페이지 자체를 보관합니다 */}
          {resource.detail.type !== "GITHUB_REPO" && resource.url && (
            <WebArchivePanel resourceId={resource.id} archived={webArchive} />
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">등록자</span>
                <span>
                  {resource.author.name}
                  <span className="text-muted-foreground">
                    {" "}
                    @{resource.author.username}
                  </span>
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">등록일</span>
                <span>{resource.createdAt.slice(0, 10)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">수정일</span>
                <span>{resource.updatedAt.slice(0, 10)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">카테고리</span>
                <span>{category?.name ?? "-"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">조회</span>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Eye className="size-3.5" />
                  {resource.viewCount}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">등록 경로</span>
                <span>
                  {resource.sourceChannel === "MCP" ? "CLI (MCP)" : "웹"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">태그</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {resource.tags.map((t) => (
                <span key={t} className="bg-muted rounded px-2 py-0.5 text-xs">
                  #{t}
                </span>
              ))}
            </CardContent>
          </Card>

          {related.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">관련 자료</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {related.map((r) => (
                  <Link
                    key={r.id}
                    href={`/resources/${getContentType(r.type).slug}/${r.slug}`}
                    className="hover:bg-muted/60 -mx-2 block rounded-md px-2 py-1.5"
                  >
                    <p className="line-clamp-2 text-sm">{r.title}</p>
                    <p className="text-muted-foreground text-xs">
                      {getContentType(r.type).label}
                    </p>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
