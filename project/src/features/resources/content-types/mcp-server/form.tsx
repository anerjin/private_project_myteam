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
  const d = detail?.type === "MCP_SERVER" ? detail : undefined;

  return (
    <>
      <Field>
        <FieldLabel htmlFor="packageName">패키지명</FieldLabel>
        <Input
          id="packageName"
          defaultValue={d?.packageName}
          placeholder="@scope/server-name"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="transport">전송 방식 *</FieldLabel>
        <Select defaultValue={d?.transport ?? "STDIO"}>
          <SelectTrigger id="transport">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="STDIO">STDIO</SelectItem>
            <SelectItem value="SSE">SSE</SelectItem>
            <SelectItem value="HTTP">HTTP</SelectItem>
          </SelectContent>
        </Select>
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
        <FieldLabel htmlFor="installCommand">설치 명령</FieldLabel>
        <Input
          id="installCommand"
          defaultValue={d?.installCommand}
          placeholder="npx -y @scope/server-name"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="configJson">설정 JSON *</FieldLabel>
        <Textarea
          id="configJson"
          rows={8}
          className="font-mono text-xs"
          defaultValue={d?.configJson}
        />
      </Field>
    </>
  );
}
