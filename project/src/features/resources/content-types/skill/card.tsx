import type { Resource } from "@/types";

export function Card({ resource }: { resource: Resource }) {
  const d = resource.detail;
  if (d.type !== "SKILL") return null;

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <code className="text-[11px]">{d.skillName}</code>
      {d.version && <span>v{d.version}</span>}
      {d.targetClients && <span>{d.targetClients.join(", ")}</span>}
    </span>
  );
}
