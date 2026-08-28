import {
  Card as UICard,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DetailRow } from "@/features/resources/components/detail-row";
import { NOTE_KIND_LABEL } from "@/features/resources/content-types/dev-note/meta";
import type { Resource } from "@/types";

export function Detail({ resource }: { resource: Resource }) {
  const d = resource.detail;
  if (d.type !== "DEV_NOTE") return null;

  return (
    <UICard>
      <CardHeader>
        <CardTitle className="text-base">노트 정보</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="divide-y">
          <DetailRow label="종류" value={NOTE_KIND_LABEL[d.noteKind]} />
          <DetailRow label="관련 프로젝트" value={d.relatedProject ?? "-"} />
          <DetailRow label="발생일" value={d.occurredAt ?? "-"} />
        </dl>
      </CardContent>
    </UICard>
  );
}
