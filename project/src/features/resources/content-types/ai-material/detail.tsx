import {
  Card as UICard,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DetailRow } from "@/features/resources/components/detail-row";
import {
  LANGUAGE_LABEL,
  MATERIAL_KIND_LABEL,
} from "@/features/resources/content-types/ai-material/meta";
import type { Resource } from "@/types";

export function Detail({ resource }: { resource: Resource }) {
  const d = resource.detail;
  if (d.type !== "AI_MATERIAL") return null;

  return (
    <div className="space-y-4">
      <UICard>
        <CardHeader>
          <CardTitle className="text-base">핵심 요약</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{d.keyPoints ?? "-"}</p>
        </CardContent>
      </UICard>

      <UICard className="border-primary/40 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">사내 적용 아이디어</CardTitle>
          <CardDescription>
            이 항목이 이 시스템의 실제 가치입니다. 비워두지 않습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm">{d.applicability ?? "-"}</CardContent>
      </UICard>

      <UICard>
        <CardHeader>
          <CardTitle className="text-base">자료 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <DetailRow label="형식" value={MATERIAL_KIND_LABEL[d.materialKind]} />
            <DetailRow label="출처" value={d.sourceName ?? "-"} />
            <DetailRow label="저자" value={d.authors?.join(", ") ?? "-"} />
            <DetailRow label="발행일" value={d.publishedAt ?? "-"} />
            <DetailRow
              label="언어"
              value={LANGUAGE_LABEL[d.language ?? "ETC"]}
            />
            <DetailRow
              label="예상 소요"
              value={d.readingTime ? `${d.readingTime}분` : "-"}
            />
          </dl>
        </CardContent>
      </UICard>
    </div>
  );
}
