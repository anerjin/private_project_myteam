import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategoryManager } from "@/features/admin/components/category-manager";
import { getContentType } from "@/features/resources/content-types";
import { TagManager } from "@/features/admin/components/tag-manager";
import { TypeSettings } from "@/features/admin/components/type-settings";
import { requireActiveUser } from "@/server/auth/guards";
import * as categoryService from "@/server/services/category.service";
import * as contentTypeService from "@/server/services/content-type.service";
import * as resourceService from "@/server/services/resource.service";
import * as tagService from "@/server/services/tag.service";

export const metadata: Metadata = { title: "분류 · 타입 관리" };

/**
 * SCR-231 분류 · 콘텐츠 타입 관리 (`FR-ADM-012`·`013`·`014`).
 *
 * ## 🔄 `ADMIN` 전용이었습니다 (`DEC-057` → `DEC-077`)
 *
 * `EDITOR` 에게 이 화면을 열어 봤다가 되돌린 기록이 여기 있었습니다 —
 * 레이아웃이 먼저 스트리밍돼 `ADMIN` 전용 화면이 `307` 대신
 * `200 + 클라이언트 리다이렉트`가 됐기 때문입니다(실측). **그 실측은 여전히
 * 유효하지만**(`(admin)/layout.tsx` 머리말에 규칙으로 남겼습니다) `DEC-077` 로
 * 낮출 등급이 없어져 재현할 수 없습니다.
 *
 * 지금 이 화면의 문은 아래 `requireActiveUser()` 하나입니다.
 *
 * > **이 파일에 `SUBCATEGORIES` 상수가 있었습니다.** `src/mocks/` 를 지우고
 * > 「목 부채 0」이라고 셌지만 그 게이트는 **import 형태**를 셌고, 목은 죽지 않고
 * > 화면 파일로 이사했을 뿐이었습니다. 확인하는 법은
 * > `scripts/verify-empty-db.ts` 입니다 — **DB 를 비우면 화면도 빕니다.**
 */
export default async function AdminTaxonomyPage() {
  // 실제 인가는 여기서 한다 — 레이아웃이 아니라 page 다 (DEC-035)
  await requireActiveUser();

  /*
   * **자료를 전부 읽어 태그를 세지 않습니다.** 1만 건이면 매 요청 1만 행을 읽고
   * 메모리에서 집계하게 됩니다 — `tags.usage_count` 가 그 일을 하려고 있는
   * 표시용 캐시이고, 등록·수정이 세어서 씁니다.
   */
  const [tags, unusedCount, typeCounts, typeSettings, categories] =
    await Promise.all([
      tagService.listAll(),
      tagService.countUnused(),
      resourceService.countByType(),
      // 운영 설정은 DB, 표현은 코드 (DEC-032) — 병합은 service 가 한다
      contentTypeService.listSettings(),
      // 관리 화면은 **끈 분류도** 봅니다 — 안 그러면 다시 켤 방법이 없습니다
      categoryService.listAllForAdmin(),
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
          <TabsTrigger value="tag">태그 ({tags.length})</TabsTrigger>
          <TabsTrigger value="type">콘텐츠 타입</TabsTrigger>
        </TabsList>

        <TabsContent value="category" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">카테고리 트리</CardTitle>
              <CardDescription>
                자료당 1개. 깊이는 2단계까지입니다. 지울 때 딸린 자료를 어디로
                옮길지 고릅니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CategoryManager categories={categories} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tag" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">태그</CardTitle>
              <CardDescription>
                CLI 수집이 늘면 유사 태그가 빠르게 늘어납니다. 주기적으로
                병합하세요.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TagManager tags={tags} unusedCount={unusedCount} />
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
            <CardContent>
              <TypeSettings
                types={typeSettings.map((t) => ({
                  code: t.code,
                  label: t.label,
                  // 색은 레지스트리가 압니다 — 서버가 꺼내 넘깁니다 (`DEC-032`)
                  badgeClass: getContentType(t.code).badgeClass,
                  description: t.description,
                  isActive: t.isActive,
                  showInNav: t.showInNav,
                  count: typeCounts[t.code] ?? 0,
                }))}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
