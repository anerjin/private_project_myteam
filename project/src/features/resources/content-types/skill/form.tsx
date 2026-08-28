import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ResourceDetail } from "@/types";

export function Form({ detail }: { detail?: ResourceDetail }) {
  const d = detail?.type === "SKILL" ? detail : undefined;

  return (
    <>
      <Field>
        <FieldLabel htmlFor="skillName">Skill 이름 *</FieldLabel>
        <Input
          id="skillName"
          defaultValue={d?.skillName}
          placeholder="queenbee-collect"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="trigger">트리거 조건 *</FieldLabel>
        <Textarea
          id="trigger"
          rows={2}
          defaultValue={d?.triggerCondition}
          placeholder="언제 이 Skill이 발동하는가"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="example">사용 예시 *</FieldLabel>
        <Textarea id="example" rows={2} defaultValue={d?.usageExample} />
      </Field>

      <Field>
        <FieldLabel htmlFor="definition">Skill 정의 원문 *</FieldLabel>
        <Textarea
          id="definition"
          rows={8}
          className="font-mono text-xs"
          defaultValue={d?.definition}
          placeholder="SKILL.md 내용을 그대로 붙여넣으세요"
        />
      </Field>
    </>
  );
}
