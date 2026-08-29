import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Pagination } from "@/components/common/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TypeBadge } from "@/features/resources/components/badges";
import { TrashActions } from "@/features/resources/components/trash-actions";
import { getContentType } from "@/features/resources/content-types";
import { pageSchema } from "@/features/resources/list.schema";
import { requireRole } from "@/server/auth/guards";
import * as resourceRepo from "@/server/repositories/resource.repository";
import * as resourceService from "@/server/services/resource.service";
import { Trash2 } from "lucide-react";

export const metadata: Metadata = { title: "자료 관리" };

const PAGE_SIZE = 30;

/**
 * SCR-221 자료 관리 · 휴지통 (`FR-ADM-010`, `FR-ADM-011`).
 *
 * ## 처리 버튼이 **배선과 함께** 왔습니다
 *
 * 여기 있던 것은 읽기 경로뿐이었습니다 — 「삭제·복구는 준비 중입니다」라고
 * 적힌 화면이었고, 그것이 정직한 상태였습니다. 이제 휴지통 행마다
 * 복구·영구 삭제가 실제로 돕니다.
 *
 * ## 전체 탭에는 **강제 삭제를 두지 않습니다**
 *
 * `FR-ADM-010` 은 「강제 수정·삭제」를 말하는데, 수정은 자료 상세의 편집
 * 화면이 이미 `EDITOR` 이상에게 열려 있고(`canEditResource`) 삭제도
 * 마찬가지입니다. 같은 일을 하는 두 번째 버튼을 관리 목록에 두면
 * **어느 쪽이 «강제»인지** 아무도 모르게 됩니다 — 관리자의 권한은
 * 별도 버튼이 아니라 `actor.role` 이 만듭니다.
 *
 * 오프셋 페이지네이터의 두 번째 소비자입니다.
 */
export default async function AdminResourcesPage({
  searchParams,
}: PageProps<"/admin/resources">) {
  // 실제 인가는 여기서 한다 — 레이아웃이 아니라 page 다 (DEC-035)
  await requireRole("ADMIN");

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const page = pageSchema.parse(one(sp.page));
  const trash = one(sp.tab) === "trash";

  const [result, trashCount] = await Promise.all([
    resourceService.list(
      { sort: "recent" },
      { kind: "offset", page, size: PAGE_SIZE },
      undefined,
      trash ? "trash" : "live"
    ),
    resourceRepo.countTrashed(),
  ]);

  const href = (n: number) =>
    `/admin/resources?${new URLSearchParams({
      ...(trash ? { tab: "trash" } : {}),
      ...(n > 1 ? { page: String(n) } : {}),
    }).toString()}`;

  return (
    <>
      <PageHeader
        title="자료 관리"
        description={
          trash
            ? "삭제한 자료입니다. 되살리거나 영구 삭제할 수 있습니다."
            : "전체 자료를 봅니다. 제목을 누르면 상세로 갑니다."
        }
        count={result.total ?? 0}
      />

      {/*
        탭을 «링크»로 둡니다 — 목록 상태의 정본은 URL 입니다 (`DEC-045`).
        클라이언트 탭으로 두면 페이지 번호와 탭이 서로 모릅니다.
      */}
      <div className="flex gap-2 border-b">
        {[
          { key: "all", label: `전체`, active: !trash, to: "/admin/resources" },
          {
            key: "trash",
            label: `휴지통 (${trashCount})`,
            active: trash,
            to: "/admin/resources?tab=trash",
          },
        ].map((t) => (
          <Link
            key={t.key}
            href={t.to}
            className={
              t.active
                ? "border-primary -mb-px border-b-2 px-3 py-2 text-sm font-medium"
                : "text-muted-foreground -mb-px px-3 py-2 text-sm"
            }
          >
            {t.label}
          </Link>
        ))}
      </div>

      {result.items.length === 0 ? (
        <EmptyState
          icon={Trash2}
          title={trash ? "휴지통이 비어 있습니다" : "자료가 없습니다"}
          description={
            trash
              ? "삭제한 자료가 여기로 옵니다. 30일 뒤 정리 작업이 실제로 지웁니다."
              : "아직 등록된 자료가 없습니다."
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[38%]">제목</TableHead>
                  <TableHead>타입</TableHead>
                  <TableHead>등록자</TableHead>
                  <TableHead>경로</TableHead>
                  <TableHead className="text-right">조회</TableHead>
                  <TableHead>등록일</TableHead>
                  {trash && <TableHead className="w-48 text-right">처리</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {trash ? (
                        <span className="text-muted-foreground">{r.title}</span>
                      ) : (
                        <Link
                          href={`/resources/${getContentType(r.type).slug}/${r.slug}`}
                          className="hover:text-primary font-medium"
                        >
                          {r.title}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell>
                      <TypeBadge type={r.type} />
                    </TableCell>
                    <TableCell className="text-sm">{r.author.name}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.sourceChannel}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.viewCount}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {r.createdAt.slice(0, 10)}
                    </TableCell>
                    {trash && (
                      <TableCell>
                        <TrashActions
                          resource={{ id: r.id, title: r.title }}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Pagination
            page={page}
            total={result.total ?? 0}
            size={PAGE_SIZE}
            hrefFor={href}
          />
        </>
      )}
    </>
  );
}
