"use client";

import { useState } from "react";
import { toast } from "sonner";

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
  COLOR_CHOICES,
  COLOR_SWATCH_CELL,
  ColorSwatch,
  NO_COLOR,
} from "@/features/projects/components/project-gantt-color-picker";
import {
  ADD_ITEM_LABEL,
  type ProjectItemCard,
} from "@/features/projects/components/project-gantt-model";
import { ProjectSpanFields } from "@/features/projects/components/project-span-fields";
import { spanReversed } from "@/features/projects/project-span";
import { ITEM_TITLE_MAX, type GanttColorKey } from "@/features/projects/schema";
import { cn } from "@/lib/utils";

/**
 * 간트의 **대화 셋** — 「항목 추가」 · 이름 바꾸기 · 삭제 확인 (`DEC-075`).
 *
 * 🔴 **저장은 여기 없습니다.** 셋 다 값을 받아 `onSubmit`/`onConfirm` 으로
 *    돌려줄 뿐이고, 낙관적 갱신과 롤백은 화면의 `runSave` 한 곳입니다 — 대화가
 *    자기 저장을 갖는 순간 «드래그로 만든 것과 버튼으로 만든 것이 다르다» 가
 *    됩니다.
 */

/**
 * 「항목 추가」 폼이 다루는 값.
 *
 * 🔴 **칸이 넷입니다 — 이름(필수) · 시작 · 끝 · 색(선택).** 규율은
 *    *"만들기 폼에 칸을 더 넣지 않는다. 첫 항목을 만드는 데 고민할 것이 있으면
 *    사람은 창을 닫는다"* 입니다. 색은 **고르지 않아도 되는 한 줄**이고(기본이
 *    「안 정함」), 이 폼이 드래그 생성이 지나가는 자리라 여기 없으면 만든 뒤
 *    메뉴를 찾아 다시 골라야 합니다.
 * ⛔ **진척률 칸이 없습니다.** 만든 직후의 진척률은 언제나 0이고, 그 뒤에 찍는
 *    자리는 막대의 우클릭 메뉴에 이미 있습니다.
 * ⛔ **담당자 칸도 없습니다.** 새 항목의 첫 질문은 «누가» 가 아니라 «무엇을
 *    언제» 입니다 — 담당자는 줄이 생긴 뒤 얼굴 자리를 눌러 정합니다.
 */
export interface NewItemValue {
  title: string;
  /** `""` = 안 정함. 저장할 때 `null` 로 바뀝니다 */
  start: string;
  end: string;
  /** `null` = 안 정함(벤더 기본색). 값 목록은 `COLOR_CHOICES` 하나입니다 */
  color: GanttColorKey | null;
}

export const EMPTY_ITEM_FORM: NewItemValue = {
  title: "",
  start: "",
  end: "",
  color: null,
};

/**
 * 「항목 추가」 대화.
 *
 * 🔄 **값이 대화 바깥에 삽니다**(다른 두 대화와 갈리는 자리입니다).
 *    미리보기 막대가 **지금 적고 있는 값**을 그려야 해서입니다. 그래도
 *    *"취소한 값이 다음에 열 때 남는"* 함정에는 안 빠집니다 — **여는 길이 전부
 *    `setAdding(초기값)`** 이라 열 때마다 값이 새로 정해집니다
 *    (`RenameDialog` 는 언마운트로 같은 일을 합니다).
 */
export function AddItemDialog({
  value,
  onChange,
  onSubmit,
}: {
  /** `null` = 닫힘. 열림이 곧 값이라 둘이 갈릴 수 없습니다 */
  value: NewItemValue | null;
  onChange: (v: NewItemValue | null) => void;
  onSubmit: (v: NewItemValue) => void;
}) {
  return (
    <Dialog open={value !== null} onOpenChange={(v) => !v && onChange(null)}>
      <DialogContent className="sm:max-w-md">
        {value !== null && (
          <AddItemBody
            value={value}
            onChange={onChange}
            onCancel={() => onChange(null)}
            onSubmit={onSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddItemBody({
  value,
  onChange,
  onCancel,
  onSubmit,
}: {
  value: NewItemValue;
  onChange: (v: NewItemValue) => void;
  onCancel: () => void;
  onSubmit: (v: NewItemValue) => void;
}) {
  const setValue = (patch: Partial<NewItemValue>) =>
    onChange({ ...value, ...patch });

  /**
   * ⚠️ **기다리지 않습니다.** 저장은 낙관적 갱신이라(`runSave`) 드래그 생성도
   *    응답을 안 기다리고 막대를 그립니다 — 여기서만 스피너를 돌리면 같은 일에
   *    두 가지 반응이 됩니다.
   */
  const submit = () => {
    /* 🔴 **여기서 이름을 다듬지 않습니다.** 앞뒤 공백을 깎는 일은 화면의
       `createItem` 한 줄이 하고(드래그 생성과 같은 자리), 여기서 한 번 더 깎으면
       **정규화가 두 벌**이 됩니다. 이 자리가 재는 것은 *"비었는가"* 하나입니다. */
    if (!value.title.trim()) {
      toast.error("이름을 적어 주세요.");
      return;
    }
    if (spanReversed(value.start, value.end)) {
      toast.error("끝이 시작보다 앞섭니다.");
      return;
    }
    onSubmit(value);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{ADD_ITEM_LABEL}</DialogTitle>
        {/* 🔴 기간이 **선택**이라는 것을 말합니다 — 안 적으면 사람은 날짜를 지어냅니다 */}
        <DialogDescription className="leading-relaxed">
          이름만 적어도 됩니다. 기간은 나중에 정할 수 있어요.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="new-project-item-title">이름</Label>
          <Input
            id="new-project-item-title"
            value={value.title}
            maxLength={ITEM_TITLE_MAX}
            autoFocus
            onChange={(e) => setValue({ title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </div>

        {/* 🔴 **목록 폼·기간 수정과 같은 칸입니다**(`project-span-fields.tsx`) */}
        <ProjectSpanFields
          idPrefix="new-project-item"
          value={{ start: value.start, end: value.end }}
          onChange={(span) => setValue(span)}
        />

        {/* 🎨 **색.** 🔴 줄의 목록은 `COLOR_CHOICES` 하나에서 옵니다 — 막대 우클릭
            메뉴·⋯ 메뉴와 **같은 배열**입니다. 여기서 라디오 대신 견본 단추를 쓰는
            이유는 자리입니다: 대화 안에서 열한 줄을 세로로 세우면 폼이 화면을 넘습니다.
            ⚠️ `role="radiogroup"` 으로 묶어 키보드·낭독기에는 라디오로 읽히게 합니다.
            ⚠️ `data-color` 는 그리는 것이 아니라 **세 자리가 같은 목록에서 왔는가**를
               값으로 맞대 보는 손잡이입니다 — 이 폼만 빼면 그 비교가 둘이 됩니다. */}
        <div className="space-y-1.5">
          <Label id="new-project-item-color">색</Label>
          <div
            role="radiogroup"
            aria-labelledby="new-project-item-color"
            className="flex flex-wrap gap-1"
          >
            {COLOR_CHOICES.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                data-color={c.value}
                data-checked={
                  (value.color ?? NO_COLOR) === c.value ? "" : undefined
                }
                aria-checked={(value.color ?? NO_COLOR) === c.value}
                aria-label={c.label}
                title={c.label}
                onClick={() => setValue({ color: c.key })}
                /* 🔴 **메뉴의 견본 칸과 같은 클래스입니다**(`COLOR_SWATCH_CELL`).
                   원본은 여기만 다른 모양(size-7 상자 안의 size-3 점)이었고 그
                   주석이 *"그때 지적의 범위 밖이라 남겨 둔 것"* 이라고 적고
                   있습니다 — 옮기면서 하나로 합쳤습니다. 크기가 둘이면 한쪽만
                   손보는 날이 옵니다(`project-gantt-color-picker` 의 같은 판단). */
                className={cn(COLOR_SWATCH_CELL, "focus-visible:ring-2")}
              >
                <ColorSwatch color={c.key} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onCancel}>
          취소
        </Button>
        <Button onClick={submit}>만들기</Button>
      </DialogFooter>
    </>
  );
}

/**
 * 이름 한 칸짜리 대화.
 *
 * 🔴 **값이 `DialogContent` 안쪽에 삽니다.** Radix Dialog 는 닫히면 아래를
 *    언마운트하므로(우리 `dialog.tsx` 에 `forceMount` 가 없습니다) 열 때마다
 *    초기값이 다시 잡힙니다. 바깥에 두면 항목 A 를 고치다 닫고 B 를 열었을 때
 *    **A 의 이름이 남습니다.**
 */
export function RenameDialog({
  item,
  onClose,
  onSubmit,
}: {
  item: ProjectItemCard | null;
  onClose: () => void;
  onSubmit: (title: string) => void;
}) {
  return (
    <Dialog open={item !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        {item !== null && (
          <RenameBody
            initial={item.title}
            onCancel={onClose}
            onSubmit={onSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RenameBody({
  initial,
  onCancel,
  onSubmit,
}: {
  initial: string;
  onCancel: () => void;
  onSubmit: (title: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DialogHeader>
        <DialogTitle>항목 이름</DialogTitle>
        <DialogDescription>타임라인 막대에 보일 이름입니다.</DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label htmlFor="project-item-title">이름</Label>
        <Input
          id="project-item-title"
          value={value}
          maxLength={ITEM_TITLE_MAX}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit(value);
          }}
        />
      </div>
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onCancel}>
          취소
        </Button>
        <Button onClick={() => onSubmit(value)}>저장</Button>
      </DialogFooter>
    </>
  );
}

/**
 * 삭제 확인 — 🔴 **되돌릴 수 없습니다**(항목에는 휴지통이 없습니다 —
 * `project-item.service.remove`). 그래서 확인 대화를 거칩니다.
 *
 * 두 입구(막대 우클릭 메뉴 · 트리 ⋯ 메뉴)가 화면의 한 `setDeleting` 으로 모여
 * **이 하나**로 옵니다. 실제로 지우는 것은 `onConfirm`(화면의 `remove`)이고,
 * 이 대화는 자기 저장을 갖지 않습니다.
 * ⚠️ `busy` 는 화면이 듭니다 — 지우는 중에 두 버튼을 잠급니다(두 번 누르면
 *    두 번째가 「찾을 수 없습니다」 토스트가 됩니다).
 */
export function DeleteItemDialog({
  item,
  busy,
  onCancel,
  onConfirm,
}: {
  /** `null` = 닫힘. 열림이 곧 대상이라 둘이 갈릴 수 없습니다 */
  item: ProjectItemCard | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={item !== null} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>「{item?.title}」을(를) 지울까요?</DialogTitle>
          <DialogDescription className="leading-relaxed">
            이 항목과 거기 달린 댓글이 함께 사라집니다.{" "}
            <strong className="text-foreground">되돌릴 수 없습니다.</strong>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            취소
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            삭제
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
