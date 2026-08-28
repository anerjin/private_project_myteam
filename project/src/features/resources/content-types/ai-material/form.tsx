import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MATERIAL_KIND_LABEL } from "@/features/resources/content-types/ai-material/meta";
import type { ResourceDetail } from "@/types";

export function Form({ detail }: { detail?: ResourceDetail }) {
  const d = detail?.type === "AI_MATERIAL" ? detail : undefined;

  return (
    <>
      <Field>
        <FieldLabel htmlFor="materialKind">자료 형식 *</FieldLabel>
        <Select defaultValue={d?.materialKind ?? "ARTICLE"}>
          <SelectTrigger id="materialKind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(MATERIAL_KIND_LABEL).map(([v, label]) => (
              <SelectItem key={v} value={v}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor="sourceName">출처</FieldLabel>
        <Input
          id="sourceName"
          defaultValue={d?.sourceName}
          placeholder="arXiv, Anthropic Blog …"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="publishedAt">발행일</FieldLabel>
        <Input id="publishedAt" type="date" defaultValue={d?.publishedAt} />
      </Field>

      <Field>
        <FieldLabel htmlFor="keyPoints">핵심 요약</FieldLabel>
        <Textarea
          id="keyPoints"
          rows={4}
          defaultValue={d?.keyPoints}
          placeholder="- 불릿 3~5개로 정리"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="applicability">사내 적용 아이디어 *</FieldLabel>
        <Textarea
          id="applicability"
          rows={3}
          defaultValue={d?.applicability}
          placeholder="드론·공간정보·개발팀 맥락에서 어떻게 쓸지 한 줄 이상"
        />
      </Field>
    </>
  );
}
