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
import type { ResourceDetail } from "@/types";

export function Form({ detail }: { detail?: ResourceDetail }) {
  const d = detail?.type === "PROMPT" ? detail : undefined;

  return (
    <>
      <Field>
        <FieldLabel htmlFor="useCase">용도 *</FieldLabel>
        <Input
          id="useCase"
          defaultValue={d?.useCase}
          placeholder="어떤 상황에 쓰는 프롬프트인가"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="targetModel">대상 모델</FieldLabel>
        <Input
          id="targetModel"
          defaultValue={d?.targetModel}
          placeholder="비워두면 제한 없음"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="usageStatus">사용 상태 *</FieldLabel>
        <Select defaultValue={d?.usageStatus ?? "REVIEWING"}>
          <SelectTrigger id="usageStatus">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="REVIEWING">검토 중</SelectItem>
            <SelectItem value="ADOPTED">사내 사용</SelectItem>
            <SelectItem value="DEPRECATED">사용 중단</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor="promptText">프롬프트 원문 *</FieldLabel>
        <Textarea
          id="promptText"
          rows={10}
          className="font-mono text-xs"
          defaultValue={d?.promptText}
          placeholder="치환할 자리는 [대괄호] 로 표시하세요"
        />
      </Field>
    </>
  );
}
