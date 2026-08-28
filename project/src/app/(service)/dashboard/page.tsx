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
import { TrendChart } from "@/features/dashboard/components/trend-chart";
import { ResourceCard } from "@/features/resources/components/resource-card";
import { getMockSession } from "@/features/auth/mock-session";
import { resources, stats } from "@/mocks";
import { getContentType } from "@/features/resources/content-types";

export const metadata: Metadata = { title: "대시보드" };

/** SCR-101 서비스 대시보드 */
export default async function DashboardPage() {
  const session = await getMockSession();
  const recent = [...resources]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);
  const popular = [...resources]
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 5);

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          안녕하세요, {session.name}님
        </h1>
        <p className="text-muted-foreground text-sm">
          팀이 모은 자료 {stats.totalResources}건이 기다리고 있습니다.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="전체 자료" value={stats.totalResources} unit="건" icon={Library} />
        <StatCard label="이번 주 신규" value={stats.weeklyNew} unit="건" icon={FilePlus2} />
        <StatCard label="내 북마크" value={stats.myBookmarks} unit="건" icon={BookMarked} />
        <StatCard label="내가 등록" value={stats.myResources} unit="건" icon={PenLine} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">최근 14일 등록 추이</CardTitle>
            <CardDescription>
              수집 경로별로 나눠 봅니다. CLI 수집이 주력 경로입니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">인기 자료</CardTitle>
            <CardDescription>최근 30일 조회 상위</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {popular.map((r, i) => (
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
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">최근 등록된 자료</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/resources">전체 보기</Link>
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {recent.map((r) => (
            <ResourceCard key={r.id} resource={r} />
          ))}
        </div>
      </section>
    </>
  );
}
