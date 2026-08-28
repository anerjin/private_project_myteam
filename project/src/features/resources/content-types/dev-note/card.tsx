import { NOTE_KIND_LABEL } from "@/features/resources/content-types/dev-note/meta";
import type { Resource } from "@/types";

export function Card({ resource }: { resource: Resource }) {
  const d = resource.detail;
  if (d.type !== "DEV_NOTE") return null;

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>{NOTE_KIND_LABEL[d.noteKind]}</span>
      {d.relatedProject && <span>{d.relatedProject}</span>}
      {d.occurredAt && <span>{d.occurredAt}</span>}
    </span>
  );
}
