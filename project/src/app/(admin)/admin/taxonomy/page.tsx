import { GripVertical, Merge, Plus } from "lucide-react";
import type { Metadata } from "next";

import { TypeBadge } from "@/features/resources/components/badges";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CATEGORIES } from "@/config/site";
import * as contentTypeService from "@/server/services/content-type.service";
import * as resourceService from "@/server/services/resource.service";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "분류 · 타입 관리" };

const SUBCATEGORIES: Record<string, string[]> = {
  "ai-model": ["LLM", "비전", "음성", "멀티모달", "파인튜닝"],
  "ai-tools": ["에이전트", "MCP", "Skill", "프롬프트", "코딩 도구"],
  geospatial: ["드론 촬영", "포인트클라우드", "GIS", "사진측량", "지도"],
  dev: ["프론트엔드", "백엔드", "인프라", "데이터"],
  internal: ["규약", "온보딩", "회고"],
};

/** SCR-231 분류 · 콘텐츠 타입 관리 */
export default async function AdminTaxonomyPage() {
  // 실제 인가는 여기서 한다 — 레이아웃이 아니라 page 다 (DEC-035)
  await requireRole("ADMIN");

  /*
   * **자료를 전부 읽어 태그를 세지 않습니다.** 1만 건이면 매 요청 1만 행을 읽고
   * 메모리에서 집계하게 됩니다 — `tags.usage_count` 가 그 일을 하려고 있는
   * 표시용 캐시이고, 등록·수정이 세어서 씁니다.
   */
  const [tagCounts, typeCounts, categoryCounts, typeSettings] =
    await Promise.all([
      resourceService.topTags(200),
      resourceService.countByType(),
      resourceService.countByCategory(),
      // 운영 설정은 DB, 표현은 코드 (DEC-032) — 병합은 service 가 한다
      contentTypeService.listSettings(),
    ]);

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
                    <code className="text-muted-foreground text-xs">
                      {c.slug}
                    </code>
                    <span className="text-muted-foreground ml-auto text-xs">
                      {categoryCounts[c.slug] ?? 0}건
                    </span>
                  </div>
                  <div className="ml-6 flex flex-wrap gap-1.5">
                    {SUBCATEGORIES[c.slug]?.map((s) => (
                      <span
                        key={s}
                        className="bg-muted rounded px-2 py-0.5 text-xs"
                      >
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
                  CLI 수집이 늘면 유사 태그가 빠르게 늘어납니다. 주기적으로
                  병합하세요.
                </CardDescription>
              </div>
              {/* 병합은 아직 없다 — 「있는데 안 된다」보다 disabled 가 정직하다 */}
              <Button size="sm" variant="outline" disabled>
                <Merge className="size-4" />
                태그 병합
              </Button>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {tagCounts.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  아직 태그가 없습니다. 자료를 등록하면 여기에 모입니다.
                </p>
              ) : (
                tagCounts.map((t) => (
                  <span
                    key={t.slug}
                    className="bg-muted inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm"
                  >
                    #{t.slug}
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {t.count}
                    </span>
                  </span>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="type" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">콘텐츠 타입</CardTitle>
              <CardDescription>
                타입의 <b>필드 구조는 코드</b>에 있습니다. 여기서는 노출 설정만
                바꿉니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              {typeSettings.map((t) => (
                <div
                  key={t.code}
                  className="flex flex-wrap items-center gap-4 py-3"
                >
                  <GripVertical className="text-muted-foreground size-4" />
                  <TypeBadge type={t.code} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{t.description}</p>
                    <code className="text-muted-foreground text-xs">
                      {t.code}
                    </code>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {typeCounts[t.code] ?? 0}건
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">
                      사이드바
                    </span>
                    <Switch defaultChecked={t.showInNav} disabled />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">활성</span>
                    {/*
                      `content_type_settings` 저장은 아직 없습니다 (`FR-ADM-014`).
                      켜고 끌 수 있으면 저장됐다고 믿게 되므로 `disabled` 로 둡니다 —
                      지금 값은 레지스트리의 상수입니다 (`DEC-032`: 표현은 코드).
                    */}
                    <Switch defaultChecked={t.isActive} disabled />
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
