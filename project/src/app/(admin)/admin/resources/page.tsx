import { Trash2 } from "lucide-react";
import type { Metadata } from "next";

import { TypeBadge } from "@/features/resources/components/badges";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PurgeResourceDialog } from "@/features/resources/components/delete-resource-dialog";
import { resources } from "@/mocks";

export const metadata: Metadata = { title: "자료 관리" };

/** SCR-221 자료 관리 · 휴지통 */
export default function AdminResourcesPage() {
  return (
    <>
      <PageHeader
        title="자료 관리"
        description="전체 자료를 관리하고 삭제된 자료를 되돌립니다."
        count={resources.length}
      />

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">전체 ({resources.length})</TabsTrigger>
          <TabsTrigger value="trash">휴지통 (0)</TabsTrigger>
        </TabsList>

        {([["all", resources]] as const).map(([key, list]) => (
          <TabsContent key={key} value={key} className="mt-4">
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[38%]">제목</TableHead>
                    <TableHead>타입</TableHead>
                    <TableHead>경로</TableHead>
                    <TableHead>등록자</TableHead>
                    <TableHead>등록일</TableHead>
                    <TableHead className="text-right">처리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <span className="truncate font-medium">{r.title}</span>
                      </TableCell>
                      <TableCell>
                        <TypeBadge type={r.type} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.sourceChannel}
                      </TableCell>
                      <TableCell className="text-sm">{r.author.name}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {r.createdAt.slice(0, 10)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <PurgeResourceDialog
                            title={r.title}
                            trigger={
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                aria-label="영구 삭제"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            }
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        ))}

        <TabsContent value="trash" className="mt-4">
          <EmptyState
            icon={Trash2}
            title="휴지통이 비어 있습니다"
            description="삭제된 자료는 30일간 여기에 보관됩니다."
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
