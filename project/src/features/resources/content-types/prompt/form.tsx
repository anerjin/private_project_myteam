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
import { USAGE_STATUS_LABEL } from "@/features/resources/content-types/usage-status";
import type { ResourceDetail } from "@/types";

/**
 * 치환 자리(`variables`)를 **입력받지 않습니다.** 원문의 `[대괄호]` 에서 뽑습니다 —
 * 따로 적게 하면 원문과 어긋나고, 어긋난 쪽이 「무엇을 넣어야 하는가」를 잘못
 * 알려 줍니다. 원문이 정본이고 목록은 파생입니다 (`prompt/write.ts`).
 */
export function Form({ detail }: { detail?: ResourceDetail }) {
  const d = detail?.type === "PROMPT" ? detail : undefined;

  return (
    <>
      <Field>
        <FieldLabel htmlFor="useCase">용도 *</FieldLabel>
        <Input
          id="useCase"
          name="useCase"
          defaultValue={d?.useCase}
          placeholder="어떤 상황에 쓰는 프롬프트인가"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="targetModel">대상 모델</FieldLabel>
        <Input
          id="targetModel"
          name="targetModel"
          defaultValue={d?.targetModel}
          placeholder="비워두면 제한 없음"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="usageStatus">사용 상태 *</FieldLabel>
        <Select name="usageStatus" defaultValue={d?.usageStatus ?? "REVIEWING"}>
          <SelectTrigger id="usageStatus">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {/* 손으로 적으면 값이 enum 과 어긋나도 아무도 모릅니다 */}
            {Object.entries(USAGE_STATUS_LABEL).map(([v, label]) => (
              <SelectItem key={v} value={v}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor="promptText">프롬프트 원문 *</FieldLabel>
        <Textarea
          id="promptText"
          name="promptText"
          rows={10}
          className="font-mono text-xs"
          defaultValue={d?.promptText}
          placeholder="치환할 자리는 [대괄호] 로 표시하세요"
        />
      </Field>
    </>
  );
}
