"use client";

import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
import { Switch } from "@/components/ui/switch";
import {
  createCategoryAction,
  deleteCategoryAction,
  reorderCategoriesAction,
  updateCategoryAction,
} from "@/server/actions/taxonomy.actions";

/**
 * SCR-231 카테고리 관리 (`FR-ADM-012`).
 *
 * ## 순서는 **버튼**으로 바꿉니다
 *
 * 규격에는 드래그가 적혀 있지만, 대분류 5개·하위 22개 규모에서 드래그는
 * 라이브러리 하나와 터치/키보드 대응을 데려옵니다. 위/아래 버튼은 **키보드로
 * 되고 스크린리더에서도 말이 됩니다.** 항목이 수십 개로 늘면 그때 바꿉니다.
 *
 * ## 삭제는 **자료를 어디로 옮길지** 묻습니다
 *
 * `resources.category_id` 는 `SetNull` 이 아니라, 자료가 있으면 그냥 지울 수
 * 없습니다 (`FR-ADM-012` 수용 기준). 몇 건이 딸려 있는지 보여주고 목적지를
 * 고르게 합니다 — 「분류 없음」도 선택지입니다.
 *
 * ## 비활성은 **지우기가 아닙니다**
 *
 * 끄면 목록·필터에서 숨지만 자료는 그대로입니다. 그래서 관리 화면은
 * **끈 것도 계속 보여줍니다** — 안 그러면 다시 켤 방법이 없습니다.
 */

export interface CategoryChild {
  slug: string;
  name: string;
  isActive: boolean;
  resourceCount: number;
}

export interface CategoryTop extends CategoryChild {
  icon: string | null;
  children: CategoryChild[];
}

/** 「분류 없음」을 `Select` 에서 나타낼 표식 — 빈 문자열은 값으로 못 씁니다 */
const NONE = "__none__";

export function CategoryManager({
  categories,
  canEdit,
}: {
  categories: CategoryTop[];
  /** `EDITOR` 이상인가 — 판정은 서버가 하고 여기는 «보여줄지»만 */
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [adding, setAdding] = useState<{ parentSlug?: string } | null>(null);
  const [editing, setEditing] = useState<CategoryTop | CategoryChild | null>(
    null
  );
  const [deleting, setDeleting] = useState<CategoryTop | CategoryChild | null>(
    null
  );

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, done: string) {
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

  /** 형제 목록 안에서 한 칸 옮긴다 — 서버에는 **배열 전체**를 보냅니다 */
  function move(siblings: { slug: string }[], index: number, delta: number) {
    const next = [...siblings];
    const target = next[index];
    const swap = next[index + delta];
    if (!target || !swap) return;
    next[index] = swap;
    next[index + delta] = target;
    run(
      () => reorderCategoriesAction(next.map((s) => s.slug)),
      "순서를 바꿨습니다."
    );
  }

  const allTargets = categories.flatMap((c) => [
    { slug: c.slug, name: c.name },
    ...c.children.map((s) => ({ slug: s.slug, name: `${c.name} › ${s.name}` })),
  ]);

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => setAdding({})}>
            <Plus className="size-4" />
            대분류 추가
          </Button>
        </div>
      )}

      {categories.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          등록된 카테고리가 없습니다.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {categories.map((c, i) => (
            <li key={c.slug} className="space-y-2 p-3">
              <Row
                item={c}
                canEdit={canEdit}
                busy={busy}
                onUp={i > 0 ? () => move(categories, i, -1) : undefined}
                onDown={
                  i < categories.length - 1
                    ? () => move(categories, i, 1)
                    : undefined
                }
                onEdit={() => setEditing(c)}
                onDelete={() => setDeleting(c)}
                onAddChild={() => setAdding({ parentSlug: c.slug })}
              />

              {c.children.length > 0 && (
                <ul className="ml-6 space-y-1 border-l pl-3">
                  {c.children.map((s, j) => (
                    <li key={s.slug}>
                      <Row
                        item={s}
                        canEdit={canEdit}
                        busy={busy}
                        small
                        onUp={j > 0 ? () => move(c.children, j, -1) : undefined}
                        onDown={
                          j < c.children.length - 1
                            ? () => move(c.children, j, 1)
                            : undefined
                        }
                        onEdit={() => setEditing(s)}
                        onDelete={() => setDeleting(s)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <AddDialog
          parentSlug={adding.parentSlug}
          parentName={
            categories.find((c) => c.slug === adding.parentSlug)?.name
          }
          onClose={() => setAdding(null)}
          onSubmit={(input) => {
            setAdding(null);
            run(() => createCategoryAction(input), "분류를 추가했습니다.");
          }}
        />
      )}

      {editing && (
        <EditDialog
          item={editing}
          onClose={() => setEditing(null)}
          onSubmit={(input) => {
            setEditing(null);
            run(
              () => updateCategoryAction({ slug: editing.slug, ...input }),
              "분류를 수정했습니다."
            );
          }}
        />
      )}

      {deleting && (
        <DeleteDialog
          item={deleting}
          targets={allTargets.filter((t) => t.slug !== deleting.slug)}
          onClose={() => setDeleting(null)}
          onSubmit={(moveTo) => {
            const name = deleting.name;
            setDeleting(null);
            run(
              () => deleteCategoryAction({ slug: deleting.slug, moveTo }),
              `«${name}» 을(를) 지웠습니다.`
            );
          }}
        />
      )}
    </div>
  );
}

function Row({
  item,
  canEdit,
  busy,
  small = false,
  onUp,
  onDown,
  onEdit,
  onDelete,
  onAddChild,
}: {
  item: CategoryChild & { icon?: string | null };
  canEdit: boolean;
  busy: boolean;
  small?: boolean;
  onUp?: () => void;
  onDown?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddChild?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={small ? "text-sm" : "font-medium"}>{item.name}</span>
      <code className="text-muted-foreground text-xs">{item.slug}</code>
      {!item.isActive && (
        <span className="text-muted-foreground rounded bg-muted px-1.5 py-0.5 text-xs">
          숨김
        </span>
      )}
      <span className="text-muted-foreground ml-auto text-xs tabular-nums">
        {item.resourceCount}건
      </span>

      {canEdit && (
        <div className="flex items-center gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="위로"
            disabled={busy || !onUp}
            onClick={onUp}
          >
            <ChevronUp className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="아래로"
            disabled={busy || !onDown}
            onClick={onDown}
          >
            <ChevronDown className="size-4" />
          </Button>
          {onAddChild && (
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label="하위분류 추가"
              disabled={busy}
              onClick={onAddChild}
            >
              <Plus className="size-4" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="수정"
            disabled={busy}
            onClick={onEdit}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="text-destructive size-7"
            aria-label="삭제"
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function AddDialog({
  parentSlug,
  parentName,
  onClose,
  onSubmit,
}: {
  parentSlug?: string;
  parentName?: string;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    slug: string;
    parentSlug?: string;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {parentName ? `${parentName} 아래에 하위분류 추가` : "대분류 추가"}
          </DialogTitle>
          <DialogDescription>
            분류는 2단계까지입니다. 주소(slug)는 나중에 바꿀 수 없습니다 —
            필터 링크에 그대로 실립니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">이름</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: AI 도구"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-slug">주소</Label>
            <Input
              id="cat-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="ai-tools"
            />
            <p className="text-muted-foreground text-xs">
              영문 소문자·숫자·하이픈만.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button
            disabled={name.trim().length === 0 || slug.trim().length === 0}
            onClick={() =>
              onSubmit({ name: name.trim(), slug: slug.trim(), parentSlug })
            }
          >
            추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  item,
  onClose,
  onSubmit,
}: {
  item: CategoryChild;
  onClose: () => void;
  onSubmit: (input: { name: string; isActive: boolean }) => void;
}) {
  const [name, setName] = useState(item.name);
  const [isActive, setIsActive] = useState(item.isActive);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>분류 수정</DialogTitle>
          <DialogDescription>
            주소(<code>{item.slug}</code>)는 바꿀 수 없습니다. 남이 공유한
            필터 링크가 죽습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cat-edit-name">이름</Label>
            <Input
              id="cat-edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">목록에 노출</p>
              <p className="text-muted-foreground text-xs">
                꺼도 자료 {item.resourceCount}건은 그대로 남습니다. 필터와
                등록 폼에서만 숨습니다.
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button
            disabled={name.trim().length === 0}
            onClick={() => onSubmit({ name: name.trim(), isActive })}
          >
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  item,
  targets,
  onClose,
  onSubmit,
}: {
  item: CategoryChild;
  targets: { slug: string; name: string }[];
  onClose: () => void;
  onSubmit: (moveTo: string | null) => void;
}) {
  const [moveTo, setMoveTo] = useState<string>(NONE);
  const hasResources = item.resourceCount > 0;

  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>«{item.name}» 을(를) 지웁니다</AlertDialogTitle>
          <AlertDialogDescription>
            {hasResources
              ? `이 분류에 자료 ${item.resourceCount}건이 있습니다. 어디로 옮길지 정해 주세요.`
              : "딸린 자료가 없습니다. 바로 지울 수 있습니다."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {hasResources && (
          <div className="space-y-1.5">
            <Label htmlFor="move-to">옮길 분류</Label>
            <Select value={moveTo} onValueChange={setMoveTo}>
              <SelectTrigger id="move-to" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>분류 없음</SelectItem>
                {targets.map((t) => (
                  <SelectItem key={t.slug} value={t.slug}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          {/*
            `AlertDialogAction` 을 안 쓰는 이유: 그 컴포넌트는 누르면 무조건
            다이얼로그를 닫습니다. 여기서는 **서버가 거절할 수 있어**
            (하위분류가 남아 있는 경우) 닫는 시점을 우리가 정해야 합니다.
          */}
          <Button
            variant="destructive"
            onClick={() => onSubmit(moveTo === NONE ? null : moveTo)}
          >
            삭제
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
