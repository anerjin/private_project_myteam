"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { CATEGORIES } from "@/config/site";
import { DeleteResourceDialog } from "@/features/resources/components/delete-resource-dialog";
import {
  getContentType,
  listContentTypes,
} from "@/features/resources/content-types";
import type { Resource, ResourceType } from "@/types";

/**
 * SCR-113 자료 등록 · 수정. `resource` 가 있으면 수정 모드.
 *
 * **타입 분기가 없습니다.** 타입 전용 필드는 레지스트리의 `Form` 이 그립니다.
 */
export function ResourceForm({ resource }: { resource?: Resource }) {
  const router = useRouter();
  const editing = !!resource;
  const [type, setType] = useState<ResourceType | null>(resource?.type ?? null);
  const [body, setBody] = useState(resource?.body ?? "");

  if (!type) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground text-sm">
          어떤 자료를 등록하시나요? 타입에 따라 입력 항목이 달라집니다.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {listContentTypes().map((t) => (
            <button key={t.code} type="button" onClick={() => setType(t.code)}>
              <Card className="hover:border-primary h-full text-left transition-colors">
                <CardContent className="space-y-2 p-5">
                  <t.icon className="text-muted-foreground size-5" />
                  <p className="font-medium">{t.label}</p>
                  <p className="text-muted-foreground text-sm">{t.description}</p>
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

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (editing) {
          toast.success("저장했습니다.");
          router.push(`/resources/${meta.slug}/${resource.slug}`);
        } else {
          toast.success("등록했습니다.", {
            description: "UI 확인용입니다. 실제 저장은 M2에서 붙습니다.",
          });
          router.push("/resources");
        }
      }}
    >
      {!editing && (
        <Button type="button" variant="ghost" size="sm" onClick={() => setType(null)}>
          <ArrowLeft className="size-4" />
          타입 다시 고르기
        </Button>
      )}

      {editing && (
        <Alert>
          <AlertTitle>타입은 바꿀 수 없습니다</AlertTitle>
          <AlertDescription>
            등록 후 타입 변경은 허용하지 않습니다. 다른 타입이 맞다면 새로 등록하고
            «대체함» 으로 연결하세요.
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
              <Input id="title" defaultValue={resource?.title} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="summary">요약</FieldLabel>
              <Input
                id="summary"
                defaultValue={resource?.summary}
                placeholder="목록 카드에 보일 한 문장"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="url">원본 URL</FieldLabel>
              <Input
                id="url"
                type="url"
                defaultValue={resource?.url}
                placeholder="https://"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="category">카테고리</FieldLabel>
              <Select defaultValue={resource?.category}>
                <SelectTrigger id="category">
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.slug} value={c.slug}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="tags">태그</FieldLabel>
              <Input
                id="tags"
                defaultValue={resource?.tags.join(", ")}
                placeholder="쉼표로 구분 · 3~5개 권장"
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
            <Button type="button" variant="ghost">
              임시 저장
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => router.back()}>
            취소
          </Button>
          <Button type="submit">{editing ? "저장" : "등록"}</Button>
        </div>
      </div>
    </form>
  );
}
