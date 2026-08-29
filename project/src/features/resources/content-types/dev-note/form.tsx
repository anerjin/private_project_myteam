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

/**
 * > **이 폼에는 `name` 이 하나도 없었습니다.** `FormData` 는 `name` 없는 입력을
 * > **싣지 않습니다** — 노트 종류·관련 프로젝트·발생일이 전부 조용히 사라지고
 * > `noteKind` 가 필수라 저장이 막혔습니다. 사용자는 왜인지 알 수 없었고,
 * > `id` 만 있는 화면은 **멀쩡해 보입니다.**
 * >
 * > Radix 의 `Select` 는 `name` 을 받으면 숨은 native `<select>` 를 함께
 * > 렌더하므로 `FormData` 에 실립니다.
 */
export function Form({ detail }: { detail?: ResourceDetail }) {
  const d = detail?.type === "DEV_NOTE" ? detail : undefined;

  return (
    <>
      <Field>
        <FieldLabel htmlFor="noteKind">노트 종류 *</FieldLabel>
        <Select name="noteKind" defaultValue={d?.noteKind ?? "TIP"}>
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
        <Input
          id="relatedProject"
          name="relatedProject"
          defaultValue={d?.relatedProject}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="occurredAt">발생일</FieldLabel>
        <Input
          id="occurredAt"
          name="occurredAt"
          type="date"
          defaultValue={d?.occurredAt}
        />
      </Field>
    </>
  );
}
