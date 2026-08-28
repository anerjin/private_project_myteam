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
import { getContentType } from "@/features/resources/content-types";
import { pageSchema } from "@/features/resources/list.schema";
import { requireRole } from "@/server/auth/guards";
import * as resourceRepo from "@/server/repositories/resource.repository";
import * as resourceService from "@/server/services/resource.service";
import { Trash2 } from "lucide-react";

export const metadata: Metadata = { title: "자료 관리" };

const PAGE_SIZE = 30;

/**
 * SCR-221 자료 관리 · 휴지통.
 *
 * **읽기 경로만 있습니다.** 강제 삭제·복구 버튼은 `P8`(관리자 전체) 몫이라
 * 여기 두지 않았습니다 — 「있는데 안 된다」보다 「아직 없다」가 정직합니다
 * (`DEC-045`, 회원 상세에서 장식 버튼을 걷어낸 것과 같은 판단).
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
        description="전체 자료를 봅니다. 삭제·복구는 준비 중입니다."
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
              ? "삭제한 자료가 여기로 옵니다. 30일 뒤 워커가 실제로 지웁니다 (P6)."
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
