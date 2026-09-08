"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { MarkdownViewer } from "@/components/common/markdown-viewer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DeleteResourceDialog } from "@/features/resources/components/delete-resource-dialog";
import { TagInput } from "@/features/resources/components/tag-input";
import {
  getContentType,
  listContentTypes,
} from "@/features/resources/content-types";
import {
  checkDuplicateAction,
  createResourceAction,
  updateResourceAction,
} from "@/server/actions/resource.actions";
import type { CategoryChoice, Resource, ResourceType } from "@/types";
import type { DuplicateHint } from "@/server/services/resource.write";

/**
 * SCR-113 자료 등록 · 수정. `resource` 가 있으면 수정 모드.
 *
 * **타입 분기가 없습니다.** 타입 전용 필드는 레지스트리의 `Form` 이 그립니다.
 */
export function ResourceForm({
  resource,
  categories,
  initialUrl,
  initialType,
}: {
  resource?: Resource;
  /**
   * **DB 의 카테고리입니다.** 전에는 `config/site.ts` 의 상수 5개를 제안했는데,
   * 저장은 `slug` 로 `categories` 행을 찾아 **못 찾으면 `null` 을 넣습니다** —
   * 상수와 테이블이 어긋나면 사용자가 고른 분류가 **오류 없이 사라집니다.**
   */
  categories: CategoryChoice[];
  /** 「URL 빠른 등록」이 넘긴 값 (`FR-RES-005`) */
  initialUrl?: string;
  initialType?: ResourceType;
}) {
  const router = useRouter();
  const editing = !!resource;
  const [type, setType] = useState<ResourceType | null>(
    resource?.type ?? initialType ?? null
  );
  const [body, setBody] = useState(resource?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateHint | null>(null);
  const [pending, startTransition] = useTransition();

  if (!type) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground text-sm">
          어떤 자료를 등록하시나요? 타입에 따라 입력 항목이 달라집니다.
        </p>
        {/*
          > **`disabled` 분기가 사라졌습니다.** `P4` 동안에는 `AI_MATERIAL` 만
          > 저장할 수 있어 나머지 다섯을 흐리게 두고 「아직 등록할 수 없습니다」
          > 라고 적었습니다. `P5` 가 여섯을 다 열었으므로 그 안내는 이제
          > **거짓**입니다 — 남겨 두면 이 저장소가 반복해서 지워 온
          > 「있는데 안 된다」의 거울상이 됩니다.
        */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {listContentTypes().map((t) => (
            <button key={t.code} type="button" onClick={() => setType(t.code)}>
              <Card className="hover:border-primary h-full text-left transition-colors">
                <CardContent className="space-y-2 p-5">
                  <t.icon className="text-muted-foreground size-5" />
                  <p className="font-medium">{t.label}</p>
                  <p className="text-muted-foreground text-sm">
                    {t.description}
                  </p>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const meta = getContentType(type);
  const TypeFields = meta.Form;

  /**
   * **`FormData` 로 받습니다.** 필드마다 state 를 두면 타입 전용 폼이 그 state 를
   * 알아야 하고, 그러면 새 타입을 추가할 때 **이 파일을 고치게** 됩니다 —
   * `DEC-032` 의 「폴더 하나 + 레지스트리 한 줄」이 깨집니다.
   * 타입 폼은 `name` 만 달면 되고 이 컴포넌트는 그 이름을 모릅니다.
   */
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    /*
     * **`Object.fromEntries(new FormData(...))` 는 배열을 죽입니다.**
     * 같은 `name` 이 여럿이면 **마지막 하나만** 남고 오류는 안 납니다 —
     * `clientSupport`·`targetClients` 를 체크박스 묶음으로 만드는 순간
     * 사용자가 셋을 골라도 하나만 저장됩니다.
     *
     * 타입 중립이라 **여기 한 곳**에서 끝납니다. 스키마 쪽은 이미 이 모양을
     * 받습니다 — `tagsField`·`authors` 가 `union([string, array(string)])` 입니다.
     */
    const fd = new FormData(e.currentTarget);
    const raw = Object.fromEntries(
      [...new Set(fd.keys())].map((k) => {
        const values = fd.getAll(k);
        return [
          k,
          values.length > 1 ? values.map(String) : String(values[0] ?? ""),
        ];
      })
    );
    /*
     * `type` 과 `body` 는 `name` 이 아니라 여기서 주입합니다 —
     * 타입은 카드로 고르고 본문은 탭 편집기가 들고 있습니다.
     * `verify-p5` 의 「폼 `name` ↔ zod 키」 대조가 이 둘을 예외로 압니다.
     */
    const input = { ...raw, type, body };

    startTransition(async () => {
      const r = editing
        ? await updateResourceAction(resource.id, input)
        : await createResourceAction(input);

      if (!r.ok) {
        // 어느 칸이 틀렸는지 먼저 보여준다 — 「입력값을 확인해 주세요」만으로는 못 고친다
        const first = r.fieldErrors
          ? Object.entries(r.fieldErrors)[0]
          : undefined;
        setError(first ? `${first[0]}: ${first[1][0]}` : r.message);
        return;
      }

      toast.success(editing ? "저장했습니다." : "등록했습니다.");
      router.push(
        `/resources/${getContentType(r.data.type).slug}/${r.data.slug}`
      );
      router.refresh();
    });
  }

  /** URL 을 다 적으면 중복을 확인한다 — 등록을 막지 않고 알려만 준다 */
  async function onUrlBlur(e: React.FocusEvent<HTMLInputElement>) {
    const url = e.currentTarget.value.trim();
    if (!url) {
      setDuplicate(null);
      return;
    }
    const r = await checkDuplicateAction(url);
    setDuplicate(r.ok ? r.data : null);
  }

  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>저장하지 못했습니다</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {duplicate && (
        <Alert>
          <AlertTitle>같은 URL 의 자료가 이미 있습니다</AlertTitle>
          <AlertDescription>
            {/*
              **막지 않습니다** (`FR-RES-011`). 같은 글을 다른 관점으로 두 번 정리하는
              일이 있고, 막으면 사람이 URL 을 살짝 바꿔 우회합니다 — 그러면 중복 감지가
              통째로 무의미해집니다. 보여주고 사람이 판단합니다.
            */}
            <Link
              href={`/resources/${getContentType(duplicate.type).slug}/${duplicate.slug}`}
              className="underline"
            >
              {duplicate.title}
            </Link>
            {" — 그대로 등록해도 됩니다."}
          </AlertDescription>
        </Alert>
      )}

      {!editing && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setType(null)}
        >
          <ArrowLeft className="size-4" />
          타입 다시 고르기
        </Button>
      )}

      {editing && (
        <Alert>
          <AlertTitle>타입은 바꿀 수 없습니다</AlertTitle>
          <AlertDescription>
            등록 후 타입 변경은 허용하지 않습니다. 다른 타입이 맞다면 새로
            등록하고 «대체함» 으로 연결하세요.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">공통 정보</CardTitle>
          <CardDescription>
            {meta.label} {editing ? "수정" : "등록"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="title">제목 *</FieldLabel>
              <Input
                id="title"
                name="title"
                defaultValue={resource?.title}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="summary">요약</FieldLabel>
              <Input
                id="summary"
                name="summary"
                defaultValue={resource?.summary}
                placeholder="목록 카드에 보일 한 문장"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="url">원본 URL</FieldLabel>
              <Input
                id="url"
                name="url"
                onBlur={onUrlBlur}
                type="url"
                defaultValue={resource?.url ?? initialUrl}
                placeholder="https://"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="category">카테고리</FieldLabel>
              <Select name="category" defaultValue={resource?.category}>
                <SelectTrigger id="category">
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.slug} value={c.slug}>
                      {c.depth === 1 ? ` ${c.name}` : c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="tags">태그</FieldLabel>
              {/*
                자동완성이 붙었습니다 (`FR-SRCH-007`). 폼과의 계약은 그대로
                **`name="tags"` 에 쉼표 문자열** 하나입니다 — `TagInput` 이
                숨은 `input` 으로 그 값을 싣습니다.
              */}
              <TagInput
                id="tags"
                defaultValue={resource?.tags.join(", ") ?? ""}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="body">본문 (마크다운)</FieldLabel>
              <Tabs defaultValue="write">
                <TabsList>
                  <TabsTrigger value="write">작성</TabsTrigger>
                  <TabsTrigger value="preview">미리보기</TabsTrigger>
                </TabsList>
                <TabsContent value="write">
                  <Textarea
                    id="body"
                    name="body"
                    rows={8}
                    className="font-mono text-xs"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="마크다운으로 작성합니다. ## 제목은 목차가 됩니다."
                  />
                </TabsContent>
                <TabsContent value="preview">
                  <div className="min-h-32 rounded-lg border p-4">
                    {body.trim() ? (
                      <MarkdownViewer content={body} />
                    ) : (
                      <span className="text-muted-foreground text-sm">
                        작성한 내용이 여기에 보입니다.
                      </span>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{meta.label} 전용 항목</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <TypeFields detail={resource?.detail} />
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {editing && <DeleteResourceDialog resource={resource} />}
        <div className="ml-auto flex gap-2">
          {!editing && (
            /*
              **`disabled` 입니다.** 임시 저장은 아직 없습니다 — `create` 가 항상
              `PUBLISHED` 로 만듭니다. 누를 수 있으면 눌러 보고 「아무 일도 안
              일어나네」가 되고, 그건 이 저장소가 반복해서 피한 「있는데 안 된다」
              입니다(태그 병합·대분류 추가 버튼과 같은 처리).
              초안을 «보는» 쪽은 이미 됩니다 — 로그인한 사람이 봅니다 (`DEC-077`).
            */
            <Button type="button" variant="ghost" disabled>
              임시 저장
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => router.back()}>
            취소
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "저장 중…" : editing ? "저장" : "등록"}
          </Button>
        </div>
      </div>
    </form>
  );
}
