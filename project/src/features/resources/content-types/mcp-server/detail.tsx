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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UsageStatusBadge } from "@/features/resources/components/badges";
import type { Resource } from "@/types";

export function Detail({ resource }: { resource: Resource }) {
  const d = resource.detail;
  if (d.type !== "MCP_SERVER") return null;

  return (
    <div className="space-y-4">
      <UICard>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">설치 · 설정</CardTitle>
          <UsageStatusBadge status={d.usageStatus} />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm">설치 명령</p>
            <div className="flex items-center gap-2">
              <code className="bg-muted flex-1 overflow-x-auto rounded px-3 py-2 font-mono text-xs">
                {d.installCommand}
              </code>
              <CopyButton value={d.installCommand ?? ""} />
            </div>
          </div>

          <Tabs defaultValue="claude-code">
            <div className="flex items-center justify-between gap-2">
              <TabsList>
                <TabsTrigger value="claude-code">Claude Code</TabsTrigger>
                <TabsTrigger value="cursor">Cursor</TabsTrigger>
              </TabsList>
              <CopyButton value={d.configJson} label="설정 복사" />
            </div>
            <TabsContent value="claude-code">
              <pre className="bg-muted overflow-x-auto rounded-lg p-4 font-mono text-xs">
                {d.configJson}
              </pre>
            </TabsContent>
            <TabsContent value="cursor">
              <pre className="bg-muted overflow-x-auto rounded-lg p-4 font-mono text-xs">
                {d.configJson}
              </pre>
            </TabsContent>
          </Tabs>
        </CardContent>
      </UICard>

      {d.envVars && d.envVars.length > 0 && (
        <UICard>
          <CardHeader>
            <CardTitle className="text-base">환경 변수</CardTitle>
            <CardDescription>
              키 이름과 설명만 보관합니다. 실제 값은 저장하지 않습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>키</TableHead>
                  <TableHead>설명</TableHead>
                  <TableHead>형태 예시</TableHead>
                  <TableHead className="w-20">필수</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.envVars.map((v) => (
                  <TableRow key={v.key}>
                    <TableCell className="font-mono text-xs">{v.key}</TableCell>
                    <TableCell className="text-sm">{v.description}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {v.example ?? "-"}
                    </TableCell>
                    <TableCell>{v.required ? "필수" : "선택"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </UICard>
      )}

      {d.providedTools && (
        <UICard>
          <CardHeader>
            <CardTitle className="text-base">
              제공 도구 {d.providedTools.length}개
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {d.providedTools.map((t) => (
              <div key={t.name} className="flex items-baseline gap-3">
                <code className="text-xs font-medium">{t.name}</code>
                <span className="text-muted-foreground text-sm">
                  {t.description}
                </span>
              </div>
            ))}
          </CardContent>
        </UICard>
      )}
    </div>
  );
}
