import { BookMarked, Eye, FilePlus2, Library, PenLine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { StatCard } from "@/components/common/stat-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getContentType } from "@/features/resources/content-types";
import { ResourceCard } from "@/features/resources/components/resource-card";
import { requireActiveUser } from "@/server/auth/guards";
import * as resourceService from "@/server/services/resource.service";

export const metadata: Metadata = { title: "대시보드" };

/**
 * SCR-101 서비스 대시보드.
 *
 * 관리자 대시보드와 같은 판단입니다 — **목 `stats` 객체를 하나의 함수로 되살리지
 * 않습니다.** 「최근 14일 등록 추이」 차트는 뺐습니다: 그 질의는 P4 남은 범위이고,
 * 데이터 없이 축만 그린 차트는 **있는데 비어 있는 것**처럼 보입니다.
 */
export default async function DashboardPage() {
  const session = await requireActiveUser();

  const [recent, popular, myStats] = await Promise.all([
    resourceService.list(
      { sort: "recent" },
      { kind: "cursor", size: 6 },
      session.userId
    ),
    resourceService.list(
      { sort: "popular" },
      { kind: "cursor", size: 5 },
      session.userId
    ),
    resourceService.myCounts(session.userId),
  ]);

  return (
    <>
      {/*
        페이지 타이틀("대시보드")은 헤더 빵부스러기가 담당한다.
        이 인사말은 제목이 아니라 인사이므로 heading 으로 두지 않는다.
      */}
      <div>
        <p className="text-2xl font-semibold tracking-tight">
          안녕하세요, {session.name}님
        </p>
        <p className="text-muted-foreground text-sm">
          팀이 모은 자료 {myStats.total}건이 기다리고 있습니다.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="전체 자료"
          value={myStats.total}
          unit="건"
          icon={Library}
        />
        <StatCard
          label="이번 주 신규"
          value={myStats.weeklyNew}
          unit="건"
          icon={FilePlus2}
        />
        <StatCard
          label="내 북마크"
          value={myStats.myBookmarks}
          unit="건"
          icon={BookMarked}
        />
        <StatCard
          label="내가 등록"
          value={myStats.myResources}
          unit="건"
          icon={PenLine}
        />
      </div>

      {popular.items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">인기 자료</CardTitle>
            <CardDescription>조회 상위</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {popular.items.map((r, i) => (
              <Link
                key={r.id}
                href={`/resources/${getContentType(r.type).slug}/${r.slug}`}
                className="hover:bg-muted/60 -mx-2 flex items-start gap-3 rounded-md px-2 py-1.5"
              >
                <span className="text-muted-foreground w-4 shrink-0 text-sm tabular-nums">
                  {i + 1}
                </span>
                <span className="line-clamp-2 flex-1 text-sm">{r.title}</span>
                <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs">
                  <Eye className="size-3" />
                  {r.viewCount}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">최근 등록된 자료</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/resources">전체 보기</Link>
          </Button>
        </div>
        {recent.items.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border py-8 text-center text-sm">
            아직 등록된 자료가 없습니다. 첫 자료를 등록해 보세요.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {recent.items.map((r) => (
              <ResourceCard key={r.id} resource={r} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
