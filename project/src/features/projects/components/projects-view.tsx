"use client";

import { Loader2, MoreHorizontal, Plus, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ProjectSpanFields } from "@/features/projects/components/project-span-fields";
import {
  fmtSpanDate,
  projectSpan,
  spanReversed,
} from "@/features/projects/project-span";
import {
  PROJECT_DESC_MAX,
  PROJECT_NAME_MAX,
  PROJECT_STATUS,
  statusLabel,
} from "@/features/projects/schema";
import {
  createProjectAction,
  deleteProjectAction,
  restoreProjectAction,
  updateProjectAction,
} from "@/server/actions/project.actions";
import type { ProjectSummary } from "@/server/services/project.service";

/**
 * 프로젝트 목록 — **카드** (`FR-PROJ-001`·`004` · `DEC-075`).
 *
 * 원본(Orbee)의 `views/projects-view.tsx` 를 옮긴 것입니다. 표 대신 카드,
 * 카드마다 **기간 한 줄과 오늘 위치**가 이 화면의 전부입니다.
 *
 * 🔴 **낙관적 갱신도 캐시도 없습니다.** 목록은 서버 컴포넌트가 service 를 직접
 *    읽고, 변경은 서버 액션 + `revalidatePath` 입니다. 간트와 정반대인데
 *    (그쪽은 화면 상태가 정본입니다) 근거가 다릅니다: 여기서 일어나는 일은
 *    드물고 한 번에 하나이며, 끝나면 화면을 다시 그려도 아무것도 안 튑니다.
 *
 * ## 🔄 원본과 갈리는 곳
 *
 * | | 원본 | 우리 | 왜 |
 * | --- | --- | --- | --- |
 * | 카드의 사람 | 참가자 얼굴 묶음 | **만든 사람 이름 한 줄** | 참가자 표가 없습니다 (`DEC-075`) |
 * | 「공유받음」 표시 | 있음 | **없음** | 전원이 전부 봅니다 — 남의 것이라는 개념이 없습니다 (`DEC-018`) |
 * | 받은 초대 | 목록 맨 위 | **없음** | 초대가 없습니다 |
 * | 폼의 칸 | 이름·기간 셋 | + **설명·상태** | 우리 표에 그 두 칸이 있습니다 (`schema.ts` 의 `PROJECT_STATUS` 주석) |
 * | 삭제 | 즉시·영구 | **휴지통** (`FR-PROJ-004`) | 되살릴 자리가 이미 있습니다 |
 * | 수정·삭제 메뉴 | 소유자에게만 | 수정은 **전원**, 삭제만 소유자·`ADMIN` | `DEC-018` — 고치는 것은 전원입니다 |
 */

/**
 * 🔴 **경계 문구 — 이 화면이 존재하는 이유의 절반입니다.**
 *
 * 간트가 죽는 흔한 길은 기능 부족이 아니라 **두 번 입력**입니다. 무엇이 자료
 * 이고 무엇이 프로젝트인지가 흐리면 사람은 양쪽에 적습니다. 경계를 지키는 것은
 * 코드가 아니라 이 한 줄입니다.
 *
 * ⛔ **다른 화면에는 넣지 않습니다.** 거기서 "프로젝트로 가세요" 라고 말하는
 *    순간 두 기능이 서로를 참조하기 시작합니다.
 */
export const PROJECT_BOUNDARY_LINE =
  "이게 언제 시작해서 언제 끝나는지가 중요한가?";

/**
 * 🔴 **자동 채움 격자입니다.** 열 수를 `sm:2 xl:3` 처럼 못 박으면 27인치에서
 *    카드 셋만 서고 오른쪽이 통째로 빕니다 — 프로젝트는 스무 개가 흔한
 *    목록이라 한눈에 들어오는 것이 값입니다. 칸 최소 240px 은 아래
 *    `SpanRow` 의 짧은 꼴(기간 한 줄)이 안 잘리는 폭입니다.
 */
const CARD_GRID =
  "grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]";

/** 폼이 다루는 값 */
interface FormValue {
  name: string;
  description: string;
  status: string;
  start: string;
  end: string;
}

const EMPTY_FORM: FormValue = {
  name: "",
  description: "",
  status: "PLANNED",
  start: "",
  end: "",
};

/**
 * 만들기·수정이 **같은 폼**입니다. 프로젝트가 가진 칸이 같으므로 두 폼이 다를
 * 수가 없고, 나누면 "만들 때는 되는데 고칠 때는 안 되는 칸" 이 생깁니다.
 *
 * 🔴 **폼 상태가 이 컴포넌트에 있고, 이 컴포넌트는 `DialogContent` 안에서만
 *    삽니다.** Radix Dialog 는 닫히면 Content 아래를 **언마운트**합니다 —
 *    그래서 열 때마다 `useState(initial)` 이 새 초기값으로 잡힙니다. 바깥에
 *    두고 효과로 다시 심는 길도 있었지만 `react-hooks/set-state-in-effect` 가
 *    막습니다. 다시 안 심으면 카드 A 를 고치다 닫고 B 를 열었을 때 **A 의 값이
 *    남습니다.**
 */
function ProjectFormBody({
  title,
  submitLabel,
  initial,
  onCancel,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  initial: FormValue;
  onCancel: () => void;
  onSubmit: (v: FormValue) => Promise<void>;
}) {
  const [value, setValue] = React.useState(initial);
  const [pending, setPending] = React.useState(false);

  const submit = async () => {
    const name = value.name.trim();
    if (!name) {
      toast.error("이름을 적어 주세요.");
      return;
    }
    if (spanReversed(value.start, value.end)) {
      toast.error("끝이 시작보다 앞섭니다.");
      return;
    }
    setPending(true);
    try {
      await onSubmit({ ...value, name });
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {/* 🔴 폼에서도 경계를 한 번 더 말합니다 — 만들기 직전이 "이게 프로젝트가
            맞나" 를 고를 수 있는 마지막 순간입니다. */}
        <DialogDescription>{PROJECT_BOUNDARY_LINE}</DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="project-name">이름</Label>
          <Input
            id="project-name"
            value={value.name}
            maxLength={PROJECT_NAME_MAX}
            autoFocus
            onChange={(e) => setValue((v) => ({ ...v, name: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !pending) void submit();
            }}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="project-description">설명</Label>
          <Textarea
            id="project-description"
            value={value.description}
            rows={2}
            maxLength={PROJECT_DESC_MAX}
            placeholder="한 줄이면 충분합니다"
            onChange={(e) =>
              setValue((v) => ({ ...v, description: e.target.value }))
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="project-status">상태</Label>
          <Select
            value={value.status}
            onValueChange={(status) => setValue((v) => ({ ...v, status }))}
          >
            <SelectTrigger id="project-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_STATUS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 🔴 **상세의 「기간 수정」과 같은 칸입니다**(`project-span-fields.tsx`).
            각자 세우면 한쪽에만 「비울 수 있음」이 붙는 날이 오고, 그때
            *"목록에서는 기간을 지울 수 있는데 상세에서는 못 지운다"* 가 됩니다. */}
        <ProjectSpanFields
          idPrefix="project-form"
          value={{ start: value.start, end: value.end }}
          onChange={(span) => setValue((x) => ({ ...x, ...span }))}
        />
      </div>

      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          취소
        </Button>
        <Button onClick={() => void submit()} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {submitLabel}
        </Button>
      </DialogFooter>
    </>
  );
}

/** 폼을 감싸는 껍데기. 열림 상태만 다루고 값은 안쪽(`ProjectFormBody`)이 갖습니다 */
function ProjectFormDialog({
  open,
  onOpenChange,
  ...body
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  submitLabel: string;
  initial: FormValue;
  onSubmit: (v: FormValue) => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && (
          <ProjectFormBody {...body} onCancel={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * 기간 한 줄 + **오늘 위치**.
 *
 * 🔴 위치를 **글자로도 적습니다.** 막대만 두면 화면 낭독기에도, 좁은 화면에도
 *    아무 정보가 없고 "진행률이 한눈에 보인다" 는 목적이 색 한 조각에만
 *    걸립니다.
 */
function SpanRow({
  project,
  today,
}: {
  project: ProjectSummary;
  today: string;
}) {
  const span = projectSpan(
    project.startsOn ?? null,
    project.endsOn ?? null,
    today
  );
  const mark =
    span.state === "before"
      ? "시작 전"
      : span.state === "done"
        ? "지남"
        : span.percent === null
          ? null
          : `오늘 ${span.percent}%`;

  return (
    <div className="mt-1.5">
      <div className="flex items-baseline justify-between gap-2">
        {/*
         * 🔴 **카드는 짧은 꼴입니다**(`8.27 ~ 10.22`). 240px 칸에서 이 줄에 남는
         *    폭으로는 긴 꼴이 안 듭니다.
         * 🔴 **`title` 이 긴 꼴입니다.** 짧게 해도 폰 2열처럼 여전히 잘리는 폭이
         *    있는데, `title` 이 없으면 **잘린 글자를 되찾을 길이 아예 없습니다.**
         *    ⚠️ 짧은 꼴을 넣으면 안 됩니다 — 화면에 보이는 것과 같은 글자라 아무
         *       정보도 안 줍니다.
         * ⛔ **상세 머리말은 긴 꼴 그대로입니다** — 거기는 폭이 남습니다.
         */}
        <span
          className="text-muted-foreground truncate text-[13px] tabular-nums"
          title={span.label}
        >
          {span.shortLabel}
        </span>
        {mark && (
          <span className="text-foreground shrink-0 text-[11px] font-semibold">
            {mark}
          </span>
        )}
      </div>
      {span.percent !== null && (
        <Progress
          value={span.percent}
          className="mt-1.5"
          aria-label="오늘 위치"
        />
      )}
    </div>
  );
}

export function ProjectsView({
  projects,
  trash,
  today,
  viewerId,
  viewerIsAdmin,
}: {
  projects: ProjectSummary[];
  /** 휴지통 탭인가 — 카드가 하는 일이 통째로 달라집니다(열리지 않고, 되살립니다) */
  trash: boolean;
  /** 오늘(YYYY-MM-DD). **서버가 한 번 정합니다** — 카드마다 `new Date()` 를 부르면
      자정 근처에서 서버가 그린 HTML 과 갈리고, 시간대가 다른 기기에서 하루가 밀립니다 */
  today: string;
  /** 삭제 단추를 그릴지 정하는 값 — ⚠️ **관문이 아닙니다**(service 의 `assertCanDelete`) */
  viewerId: string;
  viewerIsAdmin: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = React.useState<ProjectSummary | null>(null);
  const [busy, setBusy] = React.useState(false);

  const canDelete = (p: ProjectSummary) =>
    viewerIsAdmin || p.owner.id === viewerId;

  const create = async (v: FormValue) => {
    const r = await createProjectAction({
      name: v.name,
      description: v.description,
      status: v.status,
      startsOn: v.start || null,
      endsOn: v.end || null,
    });
    if (!r.ok) {
      toast.error(r.message ?? "프로젝트를 만들지 못했습니다.");
      return;
    }
    setCreating(false);
    /* 🔴 **목록이 아니라 상세로 보냅니다.** 목록으로 되돌리면 방금 만든 사람에게
       "그래서 뭘 하지" 가 남습니다 — 첫 5분을 짧게 만드는 것이 이 기능의
       성패입니다.
       ⚠️ **주소는 `slug` 입니다**(`DEC-075`) — 그래서 액션이 id 와 함께 slug 를
          돌려줍니다. 한국어 이름이면 slug 도 한국어라 `encodeURIComponent` 를
          지납니다(`lib/route-params` 가 반대편에서 되돌립니다). */
    router.push(`/projects/${encodeURIComponent(r.data.slug)}`);
  };

  const edit = async (v: FormValue) => {
    const target = editing;
    if (!target) return;
    const r = await updateProjectAction(target.id, target.slug, {
      name: v.name,
      description: v.description,
      status: v.status,
      startsOn: v.start || null,
      endsOn: v.end || null,
    });
    if (!r.ok) {
      toast.error(r.message ?? "프로젝트를 고치지 못했습니다.");
      return;
    }
    setEditing(null);
    // 목록은 서버 컴포넌트입니다 — 액션의 `revalidatePath` 가 비운 캐시를 실제로 다시 받아 옵니다.
    router.refresh();
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    const r = await deleteProjectAction(deleting.id);
    setBusy(false);
    if (!r.ok) {
      toast.error(r.message ?? "휴지통으로 옮기지 못했습니다.");
      return;
    }
    setDeleting(null);
    toast.success("휴지통으로 옮겼습니다.");
    router.refresh();
  };

  const restore = async (p: ProjectSummary) => {
    const r = await restoreProjectAction(p.id);
    if (!r.ok) {
      toast.error(r.message ?? "되살리지 못했습니다.");
      return;
    }
    toast.success("되살렸습니다.");
    router.refresh();
  };

  return (
    <section>
      {/* 🔴 휴지통 탭에는 만들기 버튼이 없습니다 — 거기서 만든 것이 어느 탭에
          생기는지가 그 자리에서 안 보입니다. */}
      {!trash && (
        <div className="mb-4 flex justify-end">
          <Button className="font-semibold" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> 새 프로젝트
          </Button>
        </div>
      )}

      {projects.length === 0 ? (
        <Card className="p-10 text-center">
          {trash ? (
            <p className="text-[15px] font-bold">휴지통이 비어 있습니다.</p>
          ) : (
            <>
              <p className="text-[15px] font-bold">아직 프로젝트가 없어요.</p>
              {/* 🔴 경계 문구의 자리. 빈 화면이 이 기능이 무엇인지 말하는 유일한 곳입니다. */}
              <p className="text-muted-foreground mt-2 text-[13px] leading-relaxed">
                프로젝트는 <strong className="text-foreground">기간</strong>을
                가진 일의 묶음입니다.
                <br />
                {PROJECT_BOUNDARY_LINE}
              </p>
            </>
          )}
        </Card>
      ) : (
        <div className={CARD_GRID}>
          {projects.map((p) => (
            <Card key={p.id} className="relative p-4">
              {/* 카드 전체가 링크지만 메뉴 버튼은 **링크 밖**입니다 — 안에 두면
                  메뉴를 누르는 것이 곧 상세로 이동하는 것이 됩니다.
                  🔴 **휴지통의 카드는 링크가 아닙니다** — `getBySlug` 가 지워진
                     것을 안 열어 주므로(service) 눌러 봐야 404 입니다. */}
              {trash ? (
                <div className="block rounded-lg pr-7">
                  <div className="text-muted-foreground truncate text-[15px] font-bold">
                    {p.name}
                  </div>
                  <SpanRow project={p} today={today} />
                </div>
              ) : (
                <Link
                  href={`/projects/${encodeURIComponent(p.slug)}`}
                  className="focus-visible:ring-ring block rounded-lg pr-7 outline-none focus-visible:ring-2"
                >
                  <div className="text-foreground truncate text-[15px] font-bold">
                    {p.name}
                  </div>
                  <SpanRow project={p} today={today} />
                </Link>
              )}

              {p.description && (
                <p className="text-muted-foreground mt-2 line-clamp-2 text-[13px]">
                  {p.description}
                </p>
              )}

              <div className="mt-2.5 flex items-center justify-between gap-2">
                <span className="text-muted-foreground truncate text-[11px]">
                  {/* 🔴 **원본의 참가자 얼굴 자리입니다.** 우리에게는 참가자가
                      없으므로(`DEC-075`) 그 자리에 **만든 사람**을 둡니다 —
                      카드가 사람에 대해 말할 수 있는 유일한 사실이고, 그 이름이
                      곧 「누가 이걸 지울 수 있는가」입니다(`FR-PROJ-004`). */}
                  {p.owner.name} · {fmtSpanDate(p.createdAt, today)}
                </span>
                <Badge variant="secondary" className="shrink-0">
                  {statusLabel(p.status)}
                </Badge>
              </div>

              {trash ? (
                <div className="mt-2.5 flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!canDelete(p)}
                    onClick={() => void restore(p)}
                  >
                    <Undo2 className="size-4" />
                    되살리기
                  </Button>
                </div>
              ) : (
                /* 🔄 **수정은 전원이 합니다** (`DEC-018`) — 원본은 이 메뉴를
                   소유자에게만 그립니다. 삭제만 소유자·`ADMIN` 이라, 못 누를
                   줄은 안 그립니다. ⚠️ 관문은 service 입니다. */
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-3 right-3 size-7"
                      aria-label={`${p.name} 메뉴`}
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing(p)}>
                      수정
                    </DropdownMenuItem>
                    {canDelete(p) && (
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setDeleting(p)}
                      >
                        휴지통으로
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </Card>
          ))}
        </div>
      )}

      <ProjectFormDialog
        open={creating}
        onOpenChange={setCreating}
        title="새 프로젝트"
        submitLabel="만들기"
        initial={EMPTY_FORM}
        onSubmit={create}
      />

      <ProjectFormDialog
        open={editing !== null}
        onOpenChange={(v) => !v && setEditing(null)}
        title="프로젝트 수정"
        submitLabel="저장"
        initial={
          editing
            ? {
                name: editing.name,
                description: editing.description ?? "",
                status: editing.status,
                start: editing.startsOn ?? "",
                end: editing.endsOn ?? "",
              }
            : EMPTY_FORM
        }
        onSubmit={edit}
      />

      {/* 🔴 **되돌릴 수 있는데도 확인을 받습니다** (`FR-PROJ-004`). 되살릴 수는
          있지만 그동안 **팀 전원이 못 봅니다** — 지우는 사람만 아는 실수가
          됩니다. 원본은 여기서 "되돌릴 수 없습니다" 라고 말하는데(휴지통이
          없어서) 우리는 그 문장이 거짓입니다. */}
      <Dialog
        open={deleting !== null}
        onOpenChange={(v) => !v && setDeleting(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="truncate">
              「{deleting?.name}」을(를) 휴지통으로 옮길까요?
            </DialogTitle>
            <DialogDescription className="leading-relaxed">
              이 프로젝트와 그 안의 항목이 함께 목록에서 사라집니다. 휴지통에서
              되살릴 수 있지만,{" "}
              <strong className="text-foreground">
                그동안 팀 전원이 볼 수 없습니다.
              </strong>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleting(null)}
              disabled={busy}
            >
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={() => void remove()}
              disabled={busy}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              휴지통으로
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
