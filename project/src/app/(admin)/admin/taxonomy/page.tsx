import { GripVertical, Merge, Plus } from "lucide-react";
import type { Metadata } from "next";

import { TypeBadge } from "@/features/resources/components/badges";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CATEGORIES } from "@/config/site";
import { listContentTypes } from "@/features/resources/content-types";
import { resources } from "@/mocks";

export const metadata: Metadata = { title: "분류 · 타입 관리" };

const SUBCATEGORIES: Record<string, string[]> = {
  "ai-model": ["LLM", "비전", "음성", "멀티모달", "파인튜닝"],
  "ai-tools": ["에이전트", "MCP", "Skill", "프롬프트", "코딩 도구"],
  geospatial: ["드론 촬영", "포인트클라우드", "GIS", "사진측량", "지도"],
  dev: ["프론트엔드", "백엔드", "인프라", "데이터"],
  internal: ["규약", "온보딩", "회고"],
};

/** SCR-231 분류 · 콘텐츠 타입 관리 */
export default function AdminTaxonomyPage() {
  const tagCounts = Object.entries(
    resources.flatMap((r) => r.tags).reduce<Record<string, number>>((acc, t) => {
      acc[t] = (acc[t] ?? 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHeader
        title="분류 · 타입 관리"
        description="카테고리 체계와 태그를 정리하고, 콘텐츠 타입의 노출을 설정합니다."
      />

      <Tabs defaultValue="category">
        <TabsList>
          <TabsTrigger value="category">카테고리</TabsTrigger>
          <TabsTrigger value="tag">태그 ({tagCounts.length})</TabsTrigger>
          <TabsTrigger value="type">콘텐츠 타입</TabsTrigger>
        </TabsList>

        <TabsContent value="category" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">카테고리 트리</CardTitle>
                <CardDescription>
                  자료당 1개. 깊이는 2단계까지입니다.
                </CardDescription>
              </div>
              <Button size="sm" variant="outline">
                <Plus className="size-4" />
                대분류 추가
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {CATEGORIES.map((c) => (
                <div key={c.slug} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <GripVertical className="text-muted-foreground size-4" />
                    <span className="font-medium">{c.name}</span>
                    <code className="text-muted-foreground text-xs">{c.slug}</code>
                    <span className="text-muted-foreground ml-auto text-xs">
                      {resources.filter((r) => r.category === c.slug).length}건
                    </span>
                  </div>
                  <div className="ml-6 flex flex-wrap gap-1.5">
                    {SUBCATEGORIES[c.slug]?.map((s) => (
                      <span key={s} className="bg-muted rounded px-2 py-0.5 text-xs">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tag" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">태그</CardTitle>
                <CardDescription>
                  CLI 수집이 늘면 유사 태그가 빠르게 늘어납니다. 주기적으로 병합하세요.
                </CardDescription>
              </div>
              <Button size="sm" variant="outline">
                <Merge className="size-4" />
                태그 병합
              </Button>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {tagCounts.map(([tag, n]) => (
                <span
                  key={tag}
                  className="bg-muted inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm"
                >
                  #{tag}
                  <span className="text-muted-foreground text-xs tabular-nums">{n}</span>
                </span>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="type" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">콘텐츠 타입</CardTitle>
              <CardDescription>
                타입의 <b>필드 구조는 코드</b>에 있습니다. 여기서는 노출 설정만 바꿉니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              {listContentTypes().map((t) => (
                <div key={t.code} className="flex flex-wrap items-center gap-4 py-3">
                  <GripVertical className="text-muted-foreground size-4" />
                  <TypeBadge type={t.code} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{t.description}</p>
                    <code className="text-muted-foreground text-xs">{t.code}</code>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {resources.filter((r) => r.type === t.code).length}건
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">사이드바</span>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">활성</span>
                    <Switch defaultChecked />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
