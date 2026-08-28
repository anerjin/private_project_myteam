import { MATERIAL_KIND_LABEL } from "@/features/resources/content-types/ai-material/meta";
import type { Resource } from "@/types";

export function Card({ resource }: { resource: Resource }) {
  const d = resource.detail;
  if (d.type !== "AI_MATERIAL") return null;

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>{MATERIAL_KIND_LABEL[d.materialKind]}</span>
      {d.sourceName && <span>{d.sourceName}</span>}
      {d.publishedAt && <span>{d.publishedAt}</span>}
    </span>
  );
}
