"use client";

import { Lock, Pencil, Plus, Trash2, Users } from "lucide-react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  createCollectionAction,
  deleteCollectionAction,
  updateCollectionAction,
} from "@/server/actions/collection.actions";

/**
 * 컬렉션 만들기·수정·삭제 (`FR-COLL-003`·`006`).
 *
 * ## 「만들기」 버튼이 이제 **실제로 만듭니다**
 *
 * 여기 있던 것은 `disabled` 였습니다 — 그때는 그게 정직했습니다
 * (`DEC-045`: 「있는데 안 된다」보다 「아직 없다」).
 *
 * ## 공개범위를 **말로** 설명합니다
 *
 * 「PRIVATE / TEAM」이라고만 쓰면 팀 공개가 *로그인한 팀원 전체*인지
 * *외부에도*인지 알 수 없습니다. Neowave Work 는 외부 공개를 하지 않으므로
 * (`DEC-017`) 「팀 전체」가 가장 넓은 범위라는 사실을 문구로 말합니다.
 */

interface Values {
  name: string;
  description: string;
  visibility: "PRIVATE" | "TEAM";
}

export function CreateCollectionButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, startTransition] = useTransition();

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        컬렉션 만들기
      </Button>

      {open && (
        <CollectionDialog
          title="컬렉션 만들기"
          confirmLabel="만들기"
          initial={{ name: "", description: "", visibility: "PRIVATE" }}
          busy={busy}
          onClose={() => setOpen(false)}
          onSubmit={(values) =>
            startTransition(async () => {
              const r = await createCollectionAction(values);
              if (!r.ok) {
                toast.error(r.message ?? "만들지 못했습니다.");
                return;
              }
              setOpen(false);
              toast.success(`«${values.name}» 을(를) 만들었습니다.`);
              router.push(`/collections/${r.data.slug}`);
            })
          }
        />
      )}
    </>
  );
}

export function EditCollectionButtons({
  collection,
}: {
  collection: {
    slug: string;
    name: string;
    description?: string;
    visibility: "PRIVATE" | "TEAM";
  };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, startTransition] = useTransition();

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
        <Pencil className="size-4" />
        수정
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive"
        onClick={() => setDeleting(true)}
      >
        <Trash2 className="size-4" />
        삭제
      </Button>

      {editing && (
        <CollectionDialog
          title="컬렉션 수정"
          confirmLabel="저장"
          initial={{
            name: collection.name,
            description: collection.description ?? "",
            visibility: collection.visibility,
          }}
          busy={busy}
          onClose={() => setEditing(false)}
          onSubmit={(values) =>
            startTransition(async () => {
              const r = await updateCollectionAction({
                slug: collection.slug,
                ...values,
                description: values.description || null,
              });
              if (!r.ok) {
                toast.error(r.message ?? "저장하지 못했습니다.");
                return;
              }
              setEditing(false);
              toast.success("저장했습니다.");
              router.refresh();
            })
          }
        />
      )}

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              «{collection.name}» 을(를) 지웁니다
            </AlertDialogTitle>
            <AlertDialogDescription>
              묶음만 사라지고 <b>자료 자체는 그대로 남습니다.</b> 담겨 있던
              자료는 목록·검색에서 계속 보입니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() =>
                startTransition(async () => {
                  const r = await deleteCollectionAction(collection.slug);
                  if (!r.ok) {
                    toast.error(r.message ?? "지우지 못했습니다.");
                    return;
                  }
                  toast.success("컬렉션을 지웠습니다.");
                  router.push("/collections");
                })
              }
            >
              삭제
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CollectionDialog({
  title,
  confirmLabel,
  initial,
  busy,
  onClose,
  onSubmit,
}: {
  title: string;
  confirmLabel: string;
  initial: Values;
  busy: boolean;
  onClose: () => void;
  onSubmit: (values: Values) => void;
}) {
  const [values, setValues] = useState<Values>(initial);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            목적에 따라 자료를 묶습니다. 온보딩 자료 묶음은 팀 공개로 두세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="coll-name">이름</Label>
            <Input
              id="coll-name"
              value={values.name}
              onChange={(e) =>
                setValues((v) => ({ ...v, name: e.target.value }))
              }
              placeholder="예: 신규 입사자 온보딩"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="coll-desc">설명</Label>
            <Textarea
              id="coll-desc"
              rows={2}
              value={values.description}
              onChange={(e) =>
                setValues((v) => ({ ...v, description: e.target.value }))
              }
              placeholder="이 묶음이 무엇인지 한 줄로"
            />
          </div>

          <div className="space-y-2">
            <Label>공개 범위</Label>
            <RadioGroup
              value={values.visibility}
              onValueChange={(x) =>
                setValues((v) => ({
                  ...v,
                  visibility: x as Values["visibility"],
                }))
              }
            >
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                <RadioGroupItem value="PRIVATE" id="vis-private" />
                <div className="space-y-0.5">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <Lock className="size-3.5" />
                    비공개
                  </p>
                  <p className="text-muted-foreground text-xs">
                    나만 봅니다. 관리자는 운영상 볼 수 있습니다.
                  </p>
                </div>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                <RadioGroupItem value="TEAM" id="vis-team" />
                <div className="space-y-0.5">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <Users className="size-3.5" />팀 공개
                  </p>
                  <p className="text-muted-foreground text-xs">
                    로그인한 팀원 전체가 봅니다. 외부에는 공개되지 않습니다.
                  </p>
                </div>
              </label>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button
            disabled={busy || values.name.trim().length === 0}
            onClick={() => onSubmit({ ...values, name: values.name.trim() })}
          >
            {busy ? "처리 중…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
