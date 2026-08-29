import type { Resource } from "@/types";
import { USAGE_STATUS_LABEL } from "@/features/resources/content-types/usage-status";



export function Card({ resource }: { resource: Resource }) {
  const d = resource.detail;
  if (d.type !== "MCP_SERVER") return null;

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>{d.transport}</span>
      <span>{USAGE_STATUS_LABEL[d.usageStatus]}</span>
      {d.providedTools && <span>도구 {d.providedTools.length}개</span>}
    </span>
  );
}
