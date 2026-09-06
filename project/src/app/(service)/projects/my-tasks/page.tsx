import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/common/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { taskStatusLabel } from "@/features/projects/schema";
import { requireActiveUser } from "@/server/auth/guards";
import * as taskService from "@/server/services/project-task.service";

export const metadata: Metadata = { title: "내 할 일" };

/**
 * 내 할 일 (`FR-PROJ-018`) — **프로젝트를 가로질러** 봅니다.
 *
 * 끝난 것은 뺍니다. 여기서 보고 싶은 것은 남은 일이지 지나간 일이 아닙니다.
 * 기한 없는 것은 뒤로 갑니다 — 아직 계획도 안 선 일이 맨 위를 차지하면
 * 이 화면이 쓸모없어집니다.
 */
export default async function MyTasksPage() {
  const session = await requireActiveUser();
  const tasks = await taskService.assignedTo(session.userId, 50);

  return (
    <>
      <PageHeader
        title="내 할 일"
        description="여러 프로젝트에서 나에게 배정된 것들입니다. 끝난 것은 빠집니다."
        count={tasks.length}
      />

      {tasks.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center text-sm">
          배정된 할 일이 없습니다.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>할 일</TableHead>
                <TableHead className="w-56">프로젝트</TableHead>
                <TableHead className="w-32">기한</TableHead>
                <TableHead className="w-24">상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.title}</TableCell>
                  <TableCell>
                    <Link
                      href={`/projects/${t.project.slug}/tasks`}
                      className="underline underline-offset-4"
                    >
                      {t.project.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm tabular-nums">
                    {t.endsOn ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {taskStatusLabel(t.status)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
