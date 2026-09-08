"use client";

import { Calculator, Merge, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  cleanupTagsAction,
  mergeTagsAction,
  recountTagsAction,
  renameTagAction,
} from "@/server/actions/taxonomy.actions";

/**
 * SCR-231 태그 관리 (`FR-ADM-013`).
 *
 * ## 왜 이 화면이 필요한가
 *
 * 태그는 자유 입력이고, CLI 수집(`P7`)이 붙으면 에이전트가 만드는 태그가
 * 빠르게 늘어납니다. `rag`·`RAG`·`retrieval-augmented` 가 따로 생기면
 * **태그로 찾는 일 자체가 안 됩니다.**
 *
 * ## 「0건」 태그를 **보여줍니다**
 *
 * 사용자 화면은 `usage_count > 0` 만 보여주지만(`topTags`), 여기서는
 * 안 쓰는 것이 곧 정리 대상입니다 — 안 보이면 지울 수도 없습니다.
 */

export interface TagRow {
  slug: string;
  label: string;
  count: number;
}

export function TagManager({
  tags,
  unusedCount,
}: {
  tags: TagRow[];
  unusedCount: number;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [merging, setMerging] = useState<TagRow | null>(null);
  const [renaming, setRenaming] = useState<TagRow | null>(null);
  const [cleaning, setCleaning] = useState(false);

  /*
   * **여기서는 클라이언트 필터가 맞습니다.** 감사 로그와 달리 태그는
   * 서버 페이징이 없고 전량이 이미 와 있습니다 — 「현재 페이지 안에서만
   * 걸린다」는 문제가 생길 자리가 아닙니다.
   */
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return tags;
    return tags.filter(
      (t) =>
        t.slug.toLowerCase().includes(term) ||
        t.label.toLowerCase().includes(term)
    );
  }, [tags, q]);

  function run(
    fn: () => Promise<{ ok: boolean; message?: string }>,
    done: string
  ) {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.message ?? "처리하지 못했습니다.");
        return;
      }
      toast.success(done);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="태그 찾기"
          className="max-w-xs"
        />
        <span className="text-muted-foreground text-sm">
          {filtered.length} / {tags.length}개
        </span>

        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              startTransition(async () => {
                const r = await recountTagsAction();
                if (!r.ok) {
                  toast.error(r.message ?? "처리하지 못했습니다.");
                  return;
                }
                toast.success(
                  r.data.fixed === 0
                    ? "사용 수가 모두 맞습니다."
                    : `${r.data.fixed}개를 정정했습니다.`
                );
                router.refresh();
              })
            }
          >
            <Calculator className="size-4" />
            사용 수 다시 세기
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || unusedCount === 0}
            onClick={() => setCleaning(true)}
          >
            <Trash2 className="size-4" />안 쓰는 태그 정리
            <span className="text-muted-foreground text-xs">
              ({unusedCount})
            </span>
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border py-8 text-center text-sm">
          {tags.length === 0
            ? "아직 태그가 없습니다. 자료를 등록하면 여기에 모입니다."
            : "찾는 태그가 없습니다."}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {filtered.map((t) => (
            <li
              key={t.slug}
              className="flex flex-wrap items-center gap-2 px-3 py-2"
            >
              <span className="font-mono text-sm">#{t.slug}</span>
              {t.label !== t.slug && (
                <span className="text-muted-foreground text-xs">{t.label}</span>
              )}
              <span
                className={
                  t.count === 0
                    ? "text-muted-foreground ml-auto text-xs"
                    : "ml-auto text-xs tabular-nums"
                }
              >
                {t.count === 0 ? "안 쓰임" : `${t.count}건`}
              </span>
              <div className="flex gap-0.5">
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label="이름 변경"
                  disabled={busy}
                  onClick={() => setRenaming(t)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label="병합"
                  disabled={busy || tags.length < 2}
                  onClick={() => setMerging(t)}
                >
                  <Merge className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {merging && (
        <MergeDialog
          from={merging}
          candidates={tags.filter((t) => t.slug !== merging.slug)}
          onClose={() => setMerging(null)}
          onSubmit={(into) => {
            const from = merging.slug;
            setMerging(null);
            run(
              () => mergeTagsAction({ from, into }),
              `#${from} 을(를) #${into} 에 합쳤습니다.`
            );
          }}
        />
      )}

      {renaming && (
        <RenameDialog
          tag={renaming}
          onClose={() => setRenaming(null)}
          onSubmit={(next) => {
            const slug = renaming.slug;
            setRenaming(null);
            run(
              () => renameTagAction({ slug, ...next }),
              `#${slug} 의 이름을 바꿨습니다.`
            );
          }}
        />
      )}

      <AlertDialog open={cleaning} onOpenChange={setCleaning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              안 쓰는 태그 {unusedCount}개를 지웁니다
            </AlertDialogTitle>
            <AlertDialogDescription>
              어느 자료에도 붙어 있지 않은 태그만 지웁니다. 되돌릴 수 없지만,
              같은 이름을 다시 쓰면 태그는 자동으로 생깁니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => {
                setCleaning(false);
                startTransition(async () => {
                  const r = await cleanupTagsAction();
                  if (!r.ok) {
                    toast.error(r.message ?? "처리하지 못했습니다.");
                    return;
                  }
                  toast.success(`${r.data.removed.length}개를 정리했습니다.`);
                  router.refresh();
                });
              }}
            >
              정리
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MergeDialog({
  from,
  candidates,
  onClose,
  onSubmit,
}: {
  from: TagRow;
  candidates: TagRow[];
  onClose: () => void;
  onSubmit: (into: string) => void;
}) {
  const [into, setInto] = useState("");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>#{from.slug} 을(를) 합칩니다</DialogTitle>
          <DialogDescription>
            자료 {from.count}건의 태그가 남길 태그로 바뀌고 #{from.slug} 은
            사라집니다. 양쪽 다 붙어 있던 자료는 한 번만 남습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="merge-into">남길 태그</Label>
          <Select value={into} onValueChange={setInto}>
            <SelectTrigger id="merge-into" className="w-full">
              <SelectValue placeholder="고르세요" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((t) => (
                <SelectItem key={t.slug} value={t.slug}>
                  #{t.slug} ({t.count}건)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button disabled={!into} onClick={() => onSubmit(into)}>
            병합
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({
  tag,
  onClose,
  onSubmit,
}: {
  tag: TagRow;
  onClose: () => void;
  onSubmit: (next: { nextSlug: string; label: string }) => void;
}) {
  const [nextSlug, setNextSlug] = useState(tag.slug);
  const [label, setLabel] = useState(tag.label);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>태그 이름 변경</DialogTitle>
          <DialogDescription>
            자료 {tag.count}건에 붙어 있습니다. 이미 있는 이름으로 바꾸려면
            «병합»을 쓰세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tag-slug">주소</Label>
            <Input
              id="tag-slug"
              value={nextSlug}
              onChange={(e) => setNextSlug(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              영문 소문자·숫자·하이픈만. 필터 링크에 실립니다.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tag-label">표시 이름</Label>
            <Input
              id="tag-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button
            disabled={nextSlug.trim().length === 0 || label.trim().length === 0}
            onClick={() =>
              onSubmit({ nextSlug: nextSlug.trim(), label: label.trim() })
            }
          >
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
