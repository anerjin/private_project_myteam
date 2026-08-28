import { FolderTree, Lock, Plus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Collection } from "@/types";
import { requireActiveUser } from "@/server/auth/guards";
import * as collectionService from "@/server/services/collection.service";

export const metadata: Metadata = { title: "컬렉션" };

function CollectionGrid({ items }: { items: Collection[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((c) => (
        <Card
          key={c.id}
          className="hover:border-primary/40 group transition-colors"
        >
          <CardContent className="space-y-3 p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="bg-muted rounded-lg p-2">
                <FolderTree className="size-4" />
              </div>
              <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                {c.visibility === "TEAM" ? (
                  <>
                    <Users className="size-3" /> 팀 공개
                  </>
                ) : (
                  <>
                    <Lock className="size-3" /> 비공개
                  </>
                )}
              </span>
            </div>
            <div className="space-y-1">
              <Link
                href={`/collections/${c.slug}`}
                className="group-hover:text-primary font-medium"
              >
                {c.name}
              </Link>
              {c.description && (
                <p className="text-muted-foreground line-clamp-2 text-sm">
                  {c.description}
                </p>
              )}
            </div>
            <div className="text-muted-foreground flex items-center gap-3 border-t pt-3 text-xs">
              <span>자료 {c.itemCount}건</span>
              <span>{c.owner.name}</span>
              <span className="ml-auto">{c.updatedAt.slice(0, 10)}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** SCR-131 컬렉션 목록 */
export default async function CollectionsPage() {
  // 인가는 레이아웃이 아니라 page 가 한다 (DEC-035)
  const session = await requireActiveUser();

  /*
   * **비공개 컬렉션 판정을 화면에서 하지 않습니다.** 여기서 걸러도 서버가 전부
   * 보냈다면 남의 비공개 컬렉션이 RSC 페이로드에 실려 나갑니다 — 안 그려도 있습니다.
   */
  const { team, mine } = await collectionService.listFor(session.userId);

  return (
    <>
      <PageHeader
        description="목적에 따라 자료를 묶습니다. 온보딩 자료 묶음도 여기서 관리합니다."
        action={
          // 만들기는 아직 없다 — 「있는데 안 된다」보다 disabled 가 정직하다 (DEC-045)
          <Button disabled>
            <Plus className="size-4" />
            컬렉션 만들기
          </Button>
        }
      />

      <Tabs defaultValue="team">
        <TabsList>
          <TabsTrigger value="team">팀 공개 ({team.length})</TabsTrigger>
          <TabsTrigger value="mine">내 컬렉션 ({mine.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="team" className="mt-4">
          {team.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border py-8 text-center text-sm">
              팀에 공개된 컬렉션이 없습니다.
            </p>
          ) : (
            <CollectionGrid items={team} />
          )}
        </TabsContent>
        <TabsContent value="mine" className="mt-4">
          {mine.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border py-8 text-center text-sm">
              만든 컬렉션이 없습니다.
            </p>
          ) : (
            <CollectionGrid items={mine} />
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
