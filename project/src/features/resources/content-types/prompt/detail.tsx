import { CopyButton } from "@/components/common/copy-button";
import {
  Card as UICard,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UsageStatusBadge } from "@/features/resources/components/badges";
import { DetailRow } from "@/features/resources/components/detail-row";
import type { Resource } from "@/types";

export function Detail({ resource }: { resource: Resource }) {
  const d = resource.detail;
  if (d.type !== "PROMPT") return null;

  return (
    <div className="space-y-4">
      <UICard>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">프롬프트 원문</CardTitle>
            <CardDescription>그대로 복사해 쓰세요</CardDescription>
          </div>
          <div className="flex gap-2">
            <UsageStatusBadge status={d.usageStatus} />
            <CopyButton value={d.promptText} label="전체 복사" />
          </div>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted overflow-x-auto rounded-lg p-4 font-mono text-xs whitespace-pre-wrap">
            {d.promptText}
          </pre>
        </CardContent>
      </UICard>

      {d.variables && d.variables.length > 0 && (
        <UICard>
          <CardHeader>
            <CardTitle className="text-base">치환 변수</CardTitle>
            <CardDescription>
              대괄호로 표시한 자리를 실제 값으로 바꿔 쓰세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">변수</TableHead>
                  <TableHead>설명</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.variables.map((v) => (
                  <TableRow key={v.name}>
                    <TableCell className="font-mono text-xs">
                      [{v.name}]
                    </TableCell>
                    <TableCell className="text-sm">{v.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </UICard>
      )}

      <UICard>
        <CardHeader>
          <CardTitle className="text-base">사용 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <DetailRow label="용도" value={d.useCase} />
            <DetailRow label="대상 모델" value={d.targetModel ?? "제한 없음"} />
          </dl>
        </CardContent>
      </UICard>
    </div>
  );
}
