import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NOTE_KIND_LABEL } from "@/features/resources/content-types/dev-note/meta";
import type { ResourceDetail } from "@/types";

export function Form({ detail }: { detail?: ResourceDetail }) {
  const d = detail?.type === "DEV_NOTE" ? detail : undefined;

  return (
    <>
      <Field>
        <FieldLabel htmlFor="noteKind">노트 종류 *</FieldLabel>
        <Select defaultValue={d?.noteKind ?? "TIP"}>
          <SelectTrigger id="noteKind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(NOTE_KIND_LABEL).map(([v, label]) => (
              <SelectItem key={v} value={v}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor="relatedProject">관련 프로젝트</FieldLabel>
        <Input id="relatedProject" defaultValue={d?.relatedProject} />
      </Field>

      <Field>
        <FieldLabel htmlFor="occurredAt">발생일</FieldLabel>
        <Input id="occurredAt" type="date" defaultValue={d?.occurredAt} />
      </Field>
    </>
  );
}
