import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/common/page-header";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireActiveUser } from "@/server/auth/guards";
import * as itemService from "@/server/services/project-item.service";

export const metadata: Metadata = { title: "내 할 일" };

/**
 * 내 할 일 (`FR-PROJ-018`) — **프로젝트를 가로질러** 봅니다.
 *
 * 🔴 **원본(Orbee)에는 이 화면이 없습니다 — 그래도 남겼습니다.** 그쪽은
 *    프로젝트가 전부 내 것이라 「가로질러 본다」가 «내 프로젝트 전부»와 같은
 *    말이고, 목록 화면이 그 일을 이미 합니다. 우리는 **전원이 모든 프로젝트를
 *    봅니다**(`DEC-018`) — 프로젝트가 스무 개면 내게 맡겨진 것을 찾으려고 스무
 *    번 들어가야 합니다. 화면을 통째로 바꾸면서도 이 하나는 남긴 이유입니다.
 *
 * 🔄 **상태 칸이 사라져 진척률로 갈립니다** (`DEC-075`). 옛 화면은
 *    `status !== "DONE"` 으로 끝난 것을 뺐는데 그 컬럼이 없어졌습니다 —
 *    **진척률 100% 를 뺍니다.** 사람이 찍는 값이라 뜻이 같고, 화면에 이미
 *    있는 값입니다(service 의 `assignedTo`).
 *
 * 기한 없는 것은 뒤로 갑니다 — 아직 계획도 안 선 일이 맨 위를 차지하면 이
 * 화면이 쓸모없어집니다.
 */
export default async function MyTasksPage() {
  const session = await requireActiveUser();
  const items = await itemService.assignedTo(session.userId, 50);

  return (
    <>
      <PageHeader
        title="내 할 일"
        description="여러 프로젝트에서 나에게 맡겨진 항목입니다. 다 끝낸 것은 빠집니다."
        count={items.length}
      />

      {items.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center text-sm">
          맡겨진 항목이 없습니다.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>항목</TableHead>
                <TableHead className="w-56">프로젝트</TableHead>
                <TableHead className="w-32">기한</TableHead>
                <TableHead className="w-32">진척률</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.title}</TableCell>
                  <TableCell>
                    {/* 🔴 **상세로 보냅니다** — 옛 화면은 `/tasks` 로 보냈고 그
                        주소가 없어졌습니다(`DEC-075`). 항목을 고치는 자리는 이제
                        상세의 타임라인 하나입니다.
                        ⚠️ 한국어 slug 는 인코딩해서 보냅니다(`lib/route-params`
                           가 반대편에서 되돌립니다). */}
                    <Link
                      href={`/projects/${encodeURIComponent(t.project.slug)}`}
                      className="underline underline-offset-4"
                    >
                      {t.project.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm tabular-nums">
                    {t.endsOn ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={t.progress} className="w-16" />
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {t.progress}%
                      </span>
                    </div>
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
