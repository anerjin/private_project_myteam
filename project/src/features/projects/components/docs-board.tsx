"use client";

import {
  ArrowDown,
  ArrowUp,
  Eye,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { MarkdownEditor } from "@/components/common/markdown-editor";
import { MarkdownViewer } from "@/components/common/markdown-viewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DOC_BODY_MAX, DOC_TITLE_MAX } from "@/features/projects/schema";
import { cn } from "@/lib/utils";
import type { Doc, DocSummary } from "@/server/services/project-doc.service";
import {
  createDocAction,
  deleteDocAction,
  reorderDocsAction,
  updateDocAction,
} from "@/server/actions/project.actions";

/**
 * 한 구획의 문서들 (`FR-PROJ-006`~`008`).
 *
 * **왼쪽에 목록, 오른쪽에 본문**입니다. 구획 하나에 문서가 여럿이라는 것이
 * 요구의 핵심이라(운영자, 2026-09-04) 목록이 언제나 보여야 합니다.
 *
 * ## 보기와 고치기를 나눕니다
 *
 * 마크다운은 **읽을 때 렌더**돼야 값이 있습니다. 늘 편집기로 열면 아무도
 * 렌더된 문서를 못 봅니다. 기본은 보기이고, 「고치기」로 들어갑니다 —
 * 자료 상세와 같은 규칙입니다.
 */
export function DocsBoard({
  projectId,
  projectSlug,
  section,
  sectionSlug,
  sectionLabel,
  docs,
  selected,
  missing,
}: {
  projectId: string;
  projectSlug: string;
  section: "PLAN" | "DESIGN" | "DEV";
  sectionSlug: string;
  sectionLabel: string;
  docs: DocSummary[];
  selected: Doc | null;
  missing: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);

  const base = `/projects/${projectSlug}/docs/${sectionSlug}`;

  function open(id: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("doc", id);
    router.push(`${base}?${next.toString()}`);
  }

  async function createDoc() {
    if (pending) return;
    setPending(true);
    const r = await createDocAction(projectId, projectSlug, {
      section,
      title: `새 ${sectionLabel} 문서`,
      body: "",
    });
    setPending(false);
    if (!r.ok) {
      toast.error(r.message ?? "만들지 못했습니다.");
      return;
    }
    router.push(`${base}?doc=${r.data.id}`);
    router.refresh();
  }

  async function remove(id: string) {
    const r = await deleteDocAction(id, projectSlug);
    if (!r.ok) {
      toast.error(r.message ?? "옮기지 못했습니다.");
      return;
    }
    toast.success("휴지통으로 옮겼습니다.");
    router.push(base);
    router.refresh();
  }

  /**
   * 한 칸 위·아래로 (`FR-PROJ-007`).
   *
   * **최종 순서를 통째로 보냅니다.** 두 행을 서로 바꾸는 방식은 값이 겹쳐
   * 있을 때 조용히 어긋납니다 (`project-doc.service.reorder` 주석).
   */
  async function move(id: string, dir: -1 | 1) {
    const ids = docs.map((d) => d.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];

    const r = await reorderDocsAction(projectId, section, ids, projectSlug);
    if (!r.ok) {
      toast.error(r.message ?? "옮기지 못했습니다.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <aside className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">{sectionLabel} 문서</h2>
          <Button size="sm" variant="ghost" onClick={() => void createDoc()}>
            <Plus className="size-4" />새 문서
          </Button>
        </div>

        {docs.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            아직 {sectionLabel} 문서가 없습니다.
          </p>
        ) : (
          <ul className="space-y-1">
            {docs.map((d, i) => (
              <li key={d.id}>
                <div
                  className={cn(
                    "group rounded-md border px-3 py-2",
                    selected?.id === d.id ? "bg-muted border-foreground/20" : ""
                  )}
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => open(d.id)}
                  >
                    <p className="truncate text-sm font-medium">{d.title}</p>
                    {d.excerpt && (
                      <p className="text-muted-foreground truncate text-xs">
                        {d.excerpt}
                      </p>
                    )}
                  </button>
                  <div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label={`${d.title} 위로`}
                      disabled={i === 0}
                      onClick={() => void move(d.id, -1)}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label={`${d.title} 아래로`}
                      disabled={i === docs.length - 1}
                      onClick={() => void move(d.id, 1)}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label={`${d.title} 휴지통으로`}
                      onClick={() => void remove(d.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="min-w-0">
        {missing && (
          <p className="text-muted-foreground text-sm">
            그 문서를 찾을 수 없습니다.
          </p>
        )}

        {!selected && !missing && (
          <p className="text-muted-foreground text-sm">
            왼쪽에서 문서를 고르거나 새로 만드십시오.
          </p>
        )}

        {selected && (
          /*
           * **`key` 로 상태를 새로 잡습니다.**
           *
           * 편집칸을 이 자리에 두고 이펙트로 다시 채웠더니
           * `react-hooks/set-state-in-effect` 가 잡았습니다 — 맞는 지적입니다.
           * 문서를 옮길 때 「제목·본문·보기/고치기」를 손으로 되돌리는 것은
           * **하나만 빠뜨려도 A 의 글이 B 에 저장되는** 종류의 코드입니다.
           *
           * 문서 id 를 `key` 로 주면 React 가 그 나무를 통째로 새로 만들고,
           * `useState` 의 초기값이 다시 잡힙니다. 되돌릴 것이 없어집니다.
           */
          <DocEditor
            key={selected.id}
            doc={selected}
            projectSlug={projectSlug}
            section={section}
          />
        )}
      </section>
    </div>
  );
}

/**
 * 문서 한 편 — 보기와 고치기.
 *
 * **기본은 보기입니다.** 마크다운은 렌더돼야 값이 있고, 늘 편집기로 열면
 * 아무도 렌더된 문서를 못 봅니다 (자료 상세와 같은 규칙).
 */
function DocEditor({
  doc,
  projectSlug,
  section,
}: {
  doc: Doc;
  projectSlug: string;
  section: "PLAN" | "DESIGN" | "DEV";
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(doc.title);
  const [body, setBody] = useState(doc.body);
  const [pending, setPending] = useState(false);

  async function save() {
    if (pending) return;
    setPending(true);
    const r = await updateDocAction(doc.id, projectSlug, {
      section,
      title,
      body,
    });
    setPending(false);
    if (!r.ok) {
      toast.error(r.message ?? "저장하지 못했습니다.");
      return;
    }
    toast.success("저장했습니다.");
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          {doc.author.name} · {doc.updatedAt.slice(0, 10)}
          {doc.versionCount > 0 && ` · 판 ${doc.versionCount}`}
        </p>
        <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
          {editing ? (
            <>
              <Eye className="size-4" />
              보기
            </>
          ) : (
            <>
              <Pencil className="size-4" />
              고치기
            </>
          )}
        </Button>
      </div>

      {editing ? (
        <div className="space-y-3">
          <Input
            aria-label="문서 제목"
            value={title}
            maxLength={DOC_TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
          />
          {/*
            **마크다운 입력기**입니다 — 서식 단추와 실시간 미리보기.
            미리보기가 자료 본문과 **같은 뷰어**라 여기서 본 것이 저장 뒤에도
            그대로입니다 (`components/common/markdown-editor`).
          */}
          <MarkdownEditor
            label="문서 본문"
            value={body}
            maxLength={DOC_BODY_MAX}
            onChange={setBody}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(false)}>
              취소
            </Button>
            <Button
              disabled={pending || !title.trim()}
              onClick={() => void save()}
            >
              {pending ? "저장 중…" : "저장"}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <h2 className="text-xl font-semibold">{doc.title}</h2>
          {doc.body ? (
            <MarkdownViewer content={doc.body} />
          ) : (
            <p className="text-muted-foreground text-sm">
              아직 내용이 없습니다. 「고치기」로 채우십시오.
            </p>
          )}
        </>
      )}
    </div>
  );
}
