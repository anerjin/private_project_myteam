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
import { MCP_TRANSPORTS } from "@/features/resources/content-types/mcp-server/schema";
import { USAGE_STATUS_LABEL } from "@/features/resources/content-types/usage-status";
import type { ResourceDetail } from "@/types";

/**
 * `envVars`·`providedTools` 는 **JSON 배열로 받습니다.**
 *
 * 키·설명·필수·예시를 칸으로 나눠 여러 줄 받으려면 동적 행 추가 UI 가 필요한데,
 * 이 값들은 대개 **README 에서 복사해 옵니다.** 한 칸에 붙여넣게 하고 스키마가
 * 모양을 검사하는 편이 사내 규모에 맞습니다 — 형식이 틀리면 오류를 냅니다
 * (조용히 버리면 사용자가 적은 것이 사라집니다).
 *
 * **환경변수의 «값»은 받지 않습니다** (`NFR-SEC-008`). 키·설명·필수·예시만입니다.
 */
export function Form({ detail }: { detail?: ResourceDetail }) {
  const d = detail?.type === "MCP_SERVER" ? detail : undefined;
  const json = (v: unknown) =>
    v === undefined || v === null ? "" : JSON.stringify(v, null, 2);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="packageName">패키지명</FieldLabel>
          <Input
            id="packageName"
            name="packageName"
            defaultValue={d?.packageName}
            placeholder="@scope/server-name"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="transport">전송 방식 *</FieldLabel>
          <Select name="transport" defaultValue={d?.transport ?? "STDIO"}>
            <SelectTrigger id="transport">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* 손으로 적으면 값이 enum 과 어긋나도 아무도 모릅니다 */}
              {MCP_TRANSPORTS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        <FieldLabel htmlFor="installCommand">설치 명령</FieldLabel>
        <Input
          id="installCommand"
          name="installCommand"
          defaultValue={d?.installCommand}
          placeholder="npx -y @scope/server-name"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="clientSupport">지원 클라이언트</FieldLabel>
        <Input
          id="clientSupport"
          name="clientSupport"
          defaultValue={d?.clientSupport?.join(", ")}
          placeholder="Claude Code, Cursor"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="configJson">설정 JSON *</FieldLabel>
        <Textarea
          id="configJson"
          name="configJson"
          rows={8}
          className="font-mono text-xs"
          defaultValue={d?.configJson}
        />
        <p className="text-muted-foreground text-xs">
          붙여넣은 그대로 저장되고 상세 화면의 «복사» 버튼이 이 값을 줍니다.
        </p>
      </Field>

      <Field>
        <FieldLabel htmlFor="envVars">환경변수</FieldLabel>
        <Textarea
          id="envVars"
          name="envVars"
          rows={4}
          className="font-mono text-xs"
          defaultValue={json(d?.envVars)}
          placeholder={
            '[{"key": "API_TOKEN", "description": "발급 토큰", "required": true, "example": "sk-..."}]'
          }
        />
        <p className="text-muted-foreground text-xs">
          키·설명·필수 여부·예시만 적습니다. <b>실제 값은 저장하지 않습니다.</b>
        </p>
      </Field>

      <Field>
        <FieldLabel htmlFor="providedTools">제공 도구</FieldLabel>
        <Textarea
          id="providedTools"
          name="providedTools"
          rows={4}
          className="font-mono text-xs"
          defaultValue={json(d?.providedTools)}
          placeholder={'[{"name": "search", "description": "자료 검색"}]'}
        />
      </Field>
    </>
  );
}
