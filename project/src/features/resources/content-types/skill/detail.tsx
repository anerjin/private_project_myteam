import { CopyButton } from "@/components/common/copy-button";
import {
  Card as UICard,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UsageStatusBadge } from "@/features/resources/components/badges";
import type { Resource } from "@/types";

export function Detail({ resource }: { resource: Resource }) {
  const d = resource.detail;
  if (d.type !== "SKILL") return null;

  // 등록자가 넣은 원문을 그대로 보여준다. 조각으로 재구성하면 원문과 어긋난다.
  const definition = d.definition;

  return (
    <div className="space-y-4">
      <UICard>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Skill 정의</CardTitle>
            <CardDescription>
              <code>{d.skillName}</code>
              {d.version && ` · v${d.version}`}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <UsageStatusBadge status={d.usageStatus} />
            <CopyButton value={definition} label="전체 복사" />
          </div>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted overflow-x-auto rounded-lg p-4 font-mono text-xs whitespace-pre-wrap">
            {definition}
          </pre>
        </CardContent>
      </UICard>

      <div className="grid gap-4 md:grid-cols-2">
        <UICard>
          <CardHeader>
            <CardTitle className="text-base">트리거 조건</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{d.triggerCondition}</CardContent>
        </UICard>
        <UICard>
          <CardHeader>
            <CardTitle className="text-base">사용 예시</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{d.usageExample}</CardContent>
        </UICard>
      </div>
    </div>
  );
}
