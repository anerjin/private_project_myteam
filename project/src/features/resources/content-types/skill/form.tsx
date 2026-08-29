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
 * > **`name` 을 붙이는 것만으로는 부족했습니다.** 이 폼은 `id="trigger"`·
 * > `id="example"` 이었는데 스키마 키는 `triggerCondition`·`usageExample` 입니다.
 * > 그대로 `name={id}` 를 달았다면 **필수 두 칸이 조용히 사라집니다** —
 * > `FormData` 는 모르는 키를 그냥 싣고 zod 는 없는 키를 「안 적었다」로 봅니다.
 * > 둘 다 오류를 내지 않습니다.
 */
export function Form({ detail }: { detail?: ResourceDetail }) {
  const d = detail?.type === "SKILL" ? detail : undefined;

  return (
    <>
      <Field>
        <FieldLabel htmlFor="skillName">Skill 이름 *</FieldLabel>
        <Input
          id="skillName"
          name="skillName"
          defaultValue={d?.skillName}
          placeholder="queenbee-collect"
        />
        <p className="text-muted-foreground text-xs">
          파일명·디렉터리명이 됩니다. 영문 소문자·숫자·하이픈만 쓸 수 있습니다.
        </p>
      </Field>

      <Field>
        <FieldLabel htmlFor="triggerCondition">트리거 조건 *</FieldLabel>
        <Textarea
          id="triggerCondition"
          name="triggerCondition"
          rows={2}
          defaultValue={d?.triggerCondition}
          placeholder="언제 이 Skill이 발동하는가"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="usageExample">사용 예시 *</FieldLabel>
        <Textarea
          id="usageExample"
          name="usageExample"
          rows={2}
          defaultValue={d?.usageExample}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="targetClients">적용 대상 도구</FieldLabel>
          <Input
            id="targetClients"
            name="targetClients"
            defaultValue={d?.targetClients?.join(", ")}
            placeholder="Claude Code, Cursor"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="version">버전</FieldLabel>
          <Input
            id="version"
            name="version"
            defaultValue={d?.version}
            placeholder="1.0.0"
          />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="usageStatus">사용 상태 *</FieldLabel>
        <Select name="usageStatus" defaultValue={d?.usageStatus ?? "REVIEWING"}>
          <SelectTrigger id="usageStatus">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(USAGE_STATUS_LABEL).map(([v, label]) => (
              <SelectItem key={v} value={v}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor="definition">Skill 정의 원문 *</FieldLabel>
        <Textarea
          id="definition"
          name="definition"
          rows={8}
          className="font-mono text-xs"
          defaultValue={d?.definition}
          placeholder="SKILL.md 내용을 그대로 붙여넣으세요"
        />
      </Field>
    </>
  );
}
