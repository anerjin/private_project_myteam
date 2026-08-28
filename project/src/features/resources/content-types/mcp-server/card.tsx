import type { Resource } from "@/types";

const USAGE: Record<string, string> = {
  REVIEWING: "검토 중",
  ADOPTED: "사내 사용",
  DEPRECATED: "사용 중단",
};

export function Card({ resource }: { resource: Resource }) {
  const d = resource.detail;
  if (d.type !== "MCP_SERVER") return null;

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>{d.transport}</span>
      <span>{USAGE[d.usageStatus]}</span>
      {d.providedTools && <span>도구 {d.providedTools.length}개</span>}
    </span>
  );
}
