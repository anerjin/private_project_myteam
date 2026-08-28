import { Card as UICard, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ResourceDetail } from "@/types";

export function Form({ detail }: { detail?: ResourceDetail }) {
  const d = detail?.type === "GITHUB_REPO" ? detail : undefined;

  return (
    <>
      {d && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="owner">소유자</FieldLabel>
            <Input id="owner" defaultValue={d.owner} disabled />
          </Field>
          <Field>
            <FieldLabel htmlFor="repo">저장소</FieldLabel>
            <Input id="repo" defaultValue={d.repo} disabled />
          </Field>
        </div>
      )}

      <UICard className="bg-muted/40">
        <CardContent className="p-4 text-sm">
          <p className="font-medium">추가 입력이 필요 없습니다</p>
          <p className="text-muted-foreground mt-1">
            스타·라이선스·언어·README는 서버가 GitHub API로 채웁니다. 추측해서
            채우지 않습니다.
          </p>
        </CardContent>
      </UICard>
    </>
  );
}
