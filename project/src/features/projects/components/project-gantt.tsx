"use client";

import { Plus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import {
  Gantt,
  type GanttRenderEventProps,
} from "@/components/reui/gantt/gantt";
import {
  GanttNav,
  GanttNavNext,
  GanttNavPrev,
  GanttNavToday,
  GanttScaleSwitcher,
  GanttTitle,
} from "@/components/reui/gantt/gantt-nav";
import type {
  GanttInteractions,
  GanttOccurrence,
  GanttProposedUpdate,
  GanttResource,
  GanttSlotDraft,
} from "@/components/reui/gantt/gantt-types";
import { GanttView } from "@/components/reui/gantt/gantt-view";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  COLOR_CHOICES,
  COLOR_GRID_W,
  COLOR_SWATCH_CELL,
  ColorSwatch,
  NO_COLOR,
} from "@/features/projects/components/project-gantt-color-picker";
import {
  GANTT_I18N,
  GANTT_LOCALE,
} from "@/features/projects/components/project-gantt-i18n";
import {
  ADD_ITEM_LABEL,
  DAY_MINUTES,
  NEW_ITEM_ROW,
  NEW_ITEM_TITLE,
  PROGRESS_STEPS,
  PROJECT_SCALES,
  fromBarRange,
  ganttAnchorFor,
  ganttNameColumnWidth,
  ganttRangeBounds,
  ganttScaleFor,
  isSaved,
  itemSpan,
  newTempId,
  outsideProjectSpan,
  revertSave,
  toGanttEvents,
  toGanttNodes,
  type GanttPreview,
  type ProjectItemCard,
  type ProjectSpanInput,
} from "@/features/projects/components/project-gantt-model";
import { ItemAssignee } from "@/features/projects/components/project-item-assignee";
import { ProjectItemComments } from "@/features/projects/components/project-item-comments";
import {
  AddItemDialog,
  DeleteItemDialog,
  EMPTY_ITEM_FORM,
  RenameDialog,
  type NewItemValue,
} from "@/features/projects/components/project-item-dialogs";
import { ItemRowMenu } from "@/features/projects/components/project-item-row-menu";
import type { ProjectPerson } from "@/features/projects/components/project-person";
import { spanReversed } from "@/features/projects/project-span";
import {
  toGanttColorKey,
  type GanttColorKey,
} from "@/features/projects/schema";
import { useDragEnabled } from "@/features/projects/use-drag-enabled";
import { atUtcMidnight } from "@/features/projects/ymd";
import type { ActionResult } from "@/lib/result";
import { cn } from "@/lib/utils";
import {
  createProjectItemAction,
  deleteProjectItemAction,
  patchProjectItemAction,
} from "@/server/actions/project.actions";

/**
 * 프로젝트 타임라인 (`FR-PROJ-014` · `FR-PROJ-015` · `DEC-070` · `DEC-075`).
 *
 * ReUI 간트(MIT)를 **우리 데이터에 잇는 어댑터**입니다. 베어 온 코드는
 * `components/reui/gantt/` 에 그대로 있고(`DEC-070`), 이 파일이 우리 것과 그쪽
 * 사이의 **유일한 접점**입니다 — 다른 화면 코드는 간트를 직접 모릅니다.
 *
 * ## 🔴 막대의 정본은 이 화면의 상태입니다
 *
 * `events` 를 controlled 로 넘기므로 화면에 보이는 자리는 오직 이 상태가
 * 정합니다. 그 전제가 깨지는 순간이 딱 둘입니다: `defaultEvents` 를 쓰거나
 * `onEventsChange` 를 연결하는 것. 그러면 ReUI 가 **자기 사본**을 갖게 되어
 * *캐시는 롤백됐는데 막대는 새 자리에 남습니다* — 사용자는 저장된 줄 압니다.
 * 그래서 낙관적 갱신의 롤백이 곧 되돌리기이고, 되돌리는 호출이 따로 없습니다.
 *
 * ## 🔴 서버 값은 마운트할 때 한 번 씨앗으로만 받습니다
 *
 * 저장 뒤에 `router.refresh()` 로 프롭을 다시 받아 오면 **낙관적 갱신과 서버
 * 값이 두 정본**이 됩니다. 저장이 성공한 순간 이 화면은 이미 옳고, 목록·상세를
 * **나중에 다시 열 때** 옛 값이 안 보이게 하는 일은 서버 액션의
 * `revalidatePath` 가 합니다.
 *
 * ## ⛔ 없는 것 (`DEC-075` — 되살리지 마십시오)
 *
 * 계층 · 마일스톤 · 선후행 · 할 일 상태. 그래서 `children` 도 `dependencies` 도
 * 안 만듭니다. 재정렬(`onResourceReorder`)도 안 넘깁니다 — 그 콜백이 없어야
 * 트리 줄에 붙잡을 제스처가 없고, 그래서 **줄을 누르면 댓글이 열립니다.**
 *
 * ## ⛔ 기간 축(`axisRange`)이 없습니다 — 원본에서 유일하게 못 가져온 것
 *
 * 근거는 `project-gantt-model.ts` 머리말에 있습니다(벤더 파일을 손대야 해서).
 * 그래서 축은 달력 단위 그대로이고, 원본이 그 모드에서 **감추던** 셋(오늘 ·
 * 앞뒤 · 스케일 선택)은 여기서 **그대로 삽니다** — 축이 고정이 아니니 셋 다
 * 화면을 실제로 바꿉니다.
 *
 * ## ⛔ `canWrite` 가 없습니다 — 우리에게는 갈릴 값이 아닙니다
 *
 * 원본은 `viewer`(읽기 전용 참가자)에게 메뉴·드래그를 통째로 감춥니다. 우리는
 * **승인된 회원 전원이 보고 고칩니다**(`DEC-018`) — 이 화면에 닿은 사람은
 * 이미 `requireActiveUser` 를 지났으므로 전부 쓸 수 있습니다. 언제나 참인 값을
 * 프롭으로 받아 두면 다음 사람이 «역할 판정이 여기 있다»고 읽습니다.
 * (지우기만 소유자·`ADMIN` 인데, 그건 **프로젝트**의 이야기이고 항목이 아닙니다.)
 */

/**
 * 🔴 **참조가 고정돼야 합니다.** ReUI 는 상태 키를 `!==` 로만 비교합니다
 * (`gantt.tsx` 의 `STATE_KEYS`). JSX 안에 리터럴로 적으면 매 렌더마다 새 값으로
 * 보입니다.
 *
 * 좁은 폭(<1280)에서는 셋을 통째로 끕니다 — 아래 `dragEnabled` 주석 참조.
 */
const INTERACTIONS_ON: GanttInteractions = {
  drag: true,
  resize: true,
  selectSlot: true,
};
const INTERACTIONS_OFF: GanttInteractions = {
  drag: false,
  resize: false,
  selectSlot: false,
};

/**
 * 🔴 **좁은 폭에서 막대의 `touch-action` 을 되돌려 줍니다.**
 *
 * 벤더는 막대에 `touch-none` 을 **박아** 두었습니다(`gantt-bar.tsx` 의 공통
 * 클래스). 드래그를 끄면서 이걸 함께 벗기지 않으면 **막대 위에서 손가락
 * 스크롤이 죽습니다** — 게다가 막대의 `onPointerDown` 이 `stopPropagation()` 을
 * 무조건 부르므로 벤더의 패닝으로도 안 흘러갑니다. 즉 막대에 손가락을 얹으면
 * 화면이 굳습니다.
 *
 * ⚠️ `max-xl:` 은 `useDragEnabled` 의 기준(1280)과 **같은 폭이어야 합니다** —
 *    드래그가 살아 있는 폭에서 풀면 이번엔 드래그가 스크롤에 먹힙니다.
 *    그쪽 파일이 그 짝을 머리말에 적어 두었습니다.
 *
 * 🔴 **모듈 상수입니다.** `classNames` 는 뷰 설정 키라(`gantt.tsx` 의
 *    `VIEW_CONFIG_KEYS`) JSX 안에 리터럴로 적으면 매 렌더 새 객체가 되고,
 *    그러면 *"every row subscribes to this context"*(벤더 주석) 대로 **모든
 *    줄이 다시 그려집니다.**
 */
const GANTT_CLASS_NAMES = { event: "max-xl:touch-auto" };

/**
 * 🔴 **트리 패널의 처음 폭(px)** — 벤더 기본값과 같은 288 입니다
 *    (`gantt-view.tsx` 의 `DEFAULT_TREE_PANEL.width`).
 *
 * 🔴 **숫자를 적는 자리가 여기 하나입니다.** 아래 `treePanel` 은 이 씨앗에서
 *    나온 **한 상태**를 `width` 와 `nameColumnWidth` 에 함께 줍니다 — 두 곳에
 *    숫자를 적으면 다음 사람이 한쪽만 고칩니다.
 */
const TREE_PANEL_WIDTH = 288;

/**
 * 트리에 줄이 하나도 없을 때의 안내.
 *
 * ⚠️ 이 자리는 **좁은 폭에서만** 나옵니다 — 데스크톱에는 「항목 추가」 빈 줄이
 *    늘 있어 줄 수가 0이 되지 않습니다. 빈 줄을 뺀 대가를 여기서 갚습니다:
 *    안 그러면 항목 0개인 프로젝트를 폰에서 열었을 때 **아무 설명 없는 빈
 *    격자**만 남아, 어포던스를 지운 것이 이번엔 *"고장 난 화면"* 으로 읽힙니다.
 * ⚠️ 그래서 여기서 **드래그를 언급하지 않습니다** — 이 폭에서는 드래그가 꺼져
 *    있고, 만드는 길은 위 버튼 하나입니다.
 */
const EMPTY_ITEMS_HINT = `아직 항목이 없습니다. 위 「${ADD_ITEM_LABEL}」 버튼으로 만들어 보세요.`;

export interface ProjectGanttProps {
  projectId: string;
  /** 주소를 만드는 값 — 액션이 `revalidatePath` 에 씁니다 (`DEC-075`: 우리 주소는 slug 입니다) */
  projectSlug: string;
  /** 프로젝트 기간. 🔴 **없을 수 있습니다** — 그때 `canDropEvent` 는 아무것도 막지 않습니다 */
  project: ProjectSpanInput;
  items: ProjectItemCard[];
  /** 오늘(YYYY-MM-DD). 서버가 정해 내려보냅니다 — 목록·상세와 같은 규약 */
  today: string;
  /**
   * 맡길 수 있는 사람 — **담당자의 얼굴·이름이 여기서 나옵니다.**
   *
   * 🔴 **간트는 사람을 직접 안 그립니다.** 이 배열을 그대로 전용 컴포넌트
   *    (`project-item-assignee.tsx`)에 넘길 뿐입니다.
   * ⚠️ 원본의 «참가자 명단»이 아니라 **승인 회원 전원**입니다(`DEC-018`) —
   *    프로젝트마다 다를 값이 아닙니다.
   */
  people: ProjectPerson[];
}

export function ProjectGantt({
  projectId,
  projectSlug,
  project,
  items: seed,
  today,
  people,
}: ProjectGanttProps) {
  const [items, setItems] = React.useState<ProjectItemCard[]>(seed);
  const [renaming, setRenaming] = React.useState<ProjectItemCard | null>(null);
  const [deleting, setDeleting] = React.useState<ProjectItemCard | null>(null);
  /**
   * 「항목 추가」 대화의 **지금 값** — `null` 이면 닫혀 있습니다.
   *
   * 🔴 **폼 상태가 대화 안쪽이 아니라 여기 있습니다**(다른 두 대화와 갈리는
   *    자리입니다). 이유는 **미리보기 막대** 하나입니다 — 대화가 떠 있는 동안
   *    놓은 자리에 막대를 남기려면 화면이 그 값을 알아야 합니다. 그래도
   *    *"취소한 값이 다음에 열 때 남는"* 함정에는 안 빠집니다: **여는 길이 전부
   *    `setAdding(초기값)`** 이라 열 때마다 값이 새로 정해집니다.
   */
  const [adding, setAdding] = React.useState<NewItemValue | null>(null);
  /**
   * 댓글이 열려 있는 항목 id.
   *
   * 🔴 **화면이 갖습니다.** 트리 줄을 누르는 것을 받는 것은 벤더의 줄
   *    (`onResourceClick`)이라 배지 버튼이 아니고, 그쪽에서 여는 길을 만들려면
   *    열림 상태가 줄 바깥에 있어야 합니다. 배지 버튼도 같은 상태를 씁니다 —
   *    두 입구가 **한 창**을 엽니다.
   */
  const [commenting, setCommenting] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  /**
   * 🔴 **트리 패널의 지금 폭 — 이름 칸이 여기서 나옵니다.**
   *
   * 벤더의 기본값이 **둘로 갈려 있습니다** — 패널은 288, 이름 칸은 208 입니다
   * (`gantt-view.tsx` 의 `DEFAULT_TREE_PANEL`). 이름 칸은 `shrink-0` +
   * `style={{ width }}` 라 절대 안 늘어나서 그 뒤 채움 칸에 **80px 이 남고**,
   * 줄의 오른쪽 끝에 붙어야 할 ⋯ 가 그 앞에서 멈춥니다.
   *
   * 🔴 **고정값으로는 못 맞춥니다.** 스플리터를 끌면 패널만 288→438 로 바뀌고
   *    이름 칸은 208 그대로라 **빈 칸이 더 벌어집니다.** 그래서 폭을 상태로 들고
   *    `onWidthChange` 로 따라가게 합니다.
   * ⚠️ **끄는 도중에는 어긋납니다.** 벤더는 끌기 중에 패널 폭을 DOM 에 직접 쓰고
   *    콜백은 **놓을 때** 한 번 부릅니다 — 손을 떼는 순간 이름 칸이 따라옵니다.
   * ⚠️ **새로고침하면 288 로 돌아옵니다** — 폭을 저장하는 것은 범위 밖입니다.
   */
  const [treeWidth, setTreeWidth] = React.useState(TREE_PANEL_WIDTH);
  /**
   * 📱 **컨테이너 폭 — 이름 칸을 패널 안에 가두는 값.**
   *
   * 벤더는 컨테이너가 좁으면 패널을 줄이면서 `onWidthChange` 를 **안 부릅니다.**
   * 그래서 폰에서는 189px 패널에 288px 이름 칸이 들어가 ⋯ 가 밖으로 밀립니다.
   * 벤더가 자기 몸통을 재는 것과 **같은 방식**(`clientWidth` + `ResizeObserver`)
   * 으로 카드를 재고, 벤더와 같은 계산(`ganttNameColumnWidth`)으로 이름 칸을
   * 자릅니다 — 그러면 두 폭이 어느 컨테이너에서도 같습니다.
   * ⚠️ 0 은 «아직 못 쟀다»(첫 렌더)이고 그때는 원하는 폭 그대로입니다.
   * ⚠️ `ResizeObserver` 가 없는 환경에서는 마운트 때 한 번만 잽니다 — 벤더도
   *    같은 처지입니다.
   */
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const nameColumnWidth = ganttNameColumnWidth(treeWidth, containerWidth);
  /**
   * 🔴 **참조를 붙듭니다.** `treePanel` 은 뷰 설정 키라 JSX 안에 리터럴로 적으면
   *    매 렌더 새 객체가 되고 **모든 줄이 다시 그려집니다.**
   * 🔴 **`width` 는 상수로 남깁니다 — 여기에 `treeWidth` 를 넣으면 안 됩니다.**
   *    벤더의 스플리터 더블클릭(«기본 폭으로 되돌리기»)이
   *    `setTreeWidth(treeConfig.width)` 이므로, 그 값이 «지금 폭» 이면 되돌아갈
   *    자리가 없어 **되돌리기가 조용히 무효가 됩니다.**
   * ⚠️ 상수로 두어도 어긋나지 않습니다: 벤더는 마운트 때 한 번만 읽고, 이
   *    컴포넌트에도 `<Gantt>` 에도 `key` 가 없어 따로 다시 마운트될 수 없습니다.
   */
  const treePanel = React.useMemo(
    () => ({
      width: TREE_PANEL_WIDTH,
      nameColumnWidth,
      onWidthChange: setTreeWidth,
    }),
    [nameColumnWidth]
  );

  /**
   * 📱 **좁은 폭(<1280)에서는 제스처를 통째로 끕니다.**
   *
   * 🔴 **끈 상태에서 무엇이 남는가** (이 화면이 폰에서 무엇인지의 정의입니다):
   *    - ✅ **막대는 그대로 보입니다.** 기간·진척률·이름을 **읽는** 일은 전부
   *         살아 있습니다.
   *    - ✅ 스케일 전환·앞뒤 이동·「오늘」·패닝·스크롤이 삽니다.
   *    - ✅ 막대의 우클릭 메뉴는 **끄지 않습니다.** 이건 제스처가 아니라
   *         목록이고, 터치에서는 롱프레스가 그 자리를 대신합니다.
   *    - ⛔ 죽는 것은 셋뿐입니다: **이동**(`drag`) · **양끝 리사이즈**(`resize`) ·
   *         **빈 트랙 드래그로 만들기**(`selectSlot` + `dragCreate`).
   *
   * 🔴 **어포던스도 함께 죽습니다** — 못 쓰는 제스처의 힌트가 남으면
   *    *"왜 안 되지"* 가 됩니다. 벤더 소스에서 확인한 세 자리:
   *    ① 리사이즈 그립 — `interactions.resize` 를 봅니다.
   *       ⚠️ 그립은 `pointer-coarse:opacity-100` 이라 **터치에서는 늘 보입니다** —
   *          안 끄면 폰에서 못 쓰는 손잡이가 막대마다 두 개씩 박혀 있습니다.
   *    ② 빈 트랙 힌트 타일 — `interactions.selectSlot` 을 봅니다.
   *    ③ 트리 맨 아래 **「항목 추가」 빈 줄** — 벤더가 아니라 **우리가** 붙인
   *       줄이고(`NEW_ITEM_ROW`), 하는 일이 *"여기를 끄세요"* 뿐이라 제스처가
   *       죽으면 순수한 거짓 약속이 됩니다. 그래서 `toGanttNodes` 로 함께 끕니다.
   *
   * 💡 **덤**: `dragCreate` 를 끄면 빈 트랙의 누름이 벤더의 **패닝**으로
   *    흘러갑니다 — 폰에서 타임라인을 손가락으로 미는 것이 오히려 자연스러워집니다.
   *
   * ⚠️ 원본은 여기에 `&& canWrite` 를 함께 겁니다. 우리에게는 그 값이 언제나
   *    참이라(파일 머리말) 폭 하나만 봅니다.
   */
  const canDrag = useDragEnabled();

  /**
   * 🔴 **아직 만들어지지 않은 항목의 막대.**
   *
   * 드래그 생성이 *"먼저 묻고, 확인해야 만든다"* 라서 생긴 **대가**를 갚습니다:
   * 대화가 떠 있는 동안 끌어 놓은 자리에 아무것도 안 보이면, 지금 방식이
   * 노리던 즉각적인 피드백이 사라집니다. 그 자리에 막대 하나를 남기고,
   * 취소하면 함께 사라집니다.
   *
   * ⚠️ **기간이 양쪽 다 있어야 그립니다.** 이름만 적어 만드는 길(툴바 버튼)에는
   *    막대가 없는 것이 맞습니다 — 만들어진 뒤에도 그 항목은 줄만 있고 막대가
   *    없습니다.
   * ⚠️ 거꾸로 된 기간은 안 그립니다. `itemSpan` 은 그것을 하루로 접지만, 여기서는
   *    **아직 저장되지 않은 값**이라 접어 보여 주면 저장될 값과 다른 것을 보여
   *    주게 됩니다.
   */
  const preview = React.useMemo<GanttPreview | null>(() => {
    if (adding === null) return null;
    if (!adding.start || !adding.end || adding.end < adding.start) return null;
    return {
      // 이름을 안 적었으면 저장될 기본 이름을 그대로 보입니다.
      title: adding.title.trim() || NEW_ITEM_TITLE,
      start: adding.start,
      end: adding.end,
      color: adding.color,
    };
  }, [adding]);

  const ganttEvents = React.useMemo(
    () => toGanttEvents(items, preview),
    [items, preview]
  );
  const ganttNodes = React.useMemo(
    () => toGanttNodes(items, canDrag, preview),
    [items, canDrag, preview]
  );

  /**
   * 🔴 **간트가 돌아다닐 수 있는 범위.** 안 넘기면 무한이라, 8월 한 달짜리
   *    프로젝트에서도 화면이 2031년까지 굴러갑니다.
   *
   * 🔴 **참조를 붙듭니다.** `rangeBounds` 는 벤더의 설정 키라 `!==` 로 비교되고,
   *    매 렌더 새 객체를 주면 설정 버전이 계속 올라갑니다.
   * ⚠️ **의존이 문자열 둘과 항목 목록입니다.** `project` 객체 자체를 넣으면
   *    상세가 매 렌더 새 리터럴을 만드므로(`project={{ start, end }}`) 붙드는
   *    뜻이 없어집니다.
   */
  const { start: projectStart, end: projectEnd } = project;
  const rangeBounds = React.useMemo(
    () => ganttRangeBounds({ start: projectStart, end: projectEnd }, items),
    [projectStart, projectEnd, items]
  );

  /** 처음 여는 스케일·자리. 프로젝트 길이에서 정합니다 */
  const initialScale = React.useMemo(
    () => ganttScaleFor({ start: projectStart, end: projectEnd }),
    [projectStart, projectEnd]
  );

  const initialDate = React.useMemo(
    () =>
      atUtcMidnight(
        ganttAnchorFor({ start: projectStart, end: projectEnd }, today)
      ),
    [projectStart, projectEnd, today]
  );

  /**
   * 낙관적 갱신 + 실패 시 롤백.
   *
   * 🔴 `before` 는 **이 렌더가 본 목록**입니다. ReUI 는 콜백을 ref 로 들고 있어
   *    언제나 최신 렌더의 닫힘을 부릅니다.
   * 🔴 **되돌리기는 `setItems(before)` 가 아닙니다.** 그 사이에 다른 항목의
   *    저장이 성공했을 수 있습니다 — A 를 끌고 곧바로 B 를 끌었는데 A 만
   *    실패하면, `before` 로 통째로 돌리는 순간 **저장된 B 까지 옛 자리로**
   *    갑니다. 그래서 `revertSave` 가 **이 저장이 건드린 항목만** 지금 목록에서
   *    되돌립니다. 함수형 갱신인 것도 같은 이유입니다 — `prev` 가 그 사이의
   *    성공을 들고 있습니다.
   *
   * ⚠️ **액션은 던지지 않습니다**(`ActionResult` — `DEV-05 · 5.2`). 원본은
   *    `catch` 하나로 실패를 받는데 우리는 `r.ok` 를 봐야 합니다. `catch` 도
   *    함께 다는 것은 네트워크가 끊기는 갈래가 남아 있기 때문이고, 그때는
   *    서버가 준 말이 없으므로 `failure` 를 씁니다.
   */
  const runSave = React.useCallback(
    (
      next: ProjectItemCard[],
      action: () => Promise<ActionResult<unknown>>,
      failure: string
    ) => {
      const before = items;
      setItems(next);
      const rollback = (message: string) => {
        setItems((prev) => revertSave(prev, before, next));
        toast.error(message);
      };
      void action()
        .then((r) => {
          if (!r.ok) rollback(r.message ?? failure);
        })
        .catch(() => rollback(failure));
    },
    [items]
  );

  /**
   * 🔴 **아직 저장이 안 끝난 줄에는 아무것도 안 보냅니다** (`DEC-075`).
   *
   * id 를 서버가 발급하므로(모델의 `isSaved` 주석) 만든 직후 한순간 그 줄에는
   * 진짜 id 가 없습니다. 그대로 보내면 서버가 「항목을 찾을 수 없습니다」로
   * 거절하고, 낙관적 갱신이 롤백되어 **방금 만든 항목이 화면에서 사라집니다** —
   * 사람은 만들기가 실패한 줄 압니다.
   *
   * ⚠️ 이 갈래는 원본에 없습니다(거기는 화면이 id 를 정합니다). 대신 원본이
   *    치르는 값은 «클라이언트가 정한 id 를 서버가 믿는 것»이고, 우리는 그것을
   *    안 믿기로 했습니다(`project-item.service.create` 머리말).
   */
  const guardSaved = React.useCallback((item: ProjectItemCard): boolean => {
    if (isSaved(item.id)) return true;
    toast.info("저장하는 중입니다. 잠시 뒤에 다시 해 주세요.");
    return false;
  }, []);

  /**
   * 🔴 **항목이 생기는 유일한 자리.** 드래그 생성과 「항목 추가」 버튼이 **같은
   *    폼**을 지나 이 함수 하나로 같은 액션을 부릅니다.
   *
   *    두 길이 각자 액션을 부르면 갈리는 것이 셋입니다 — **정규화**(앞뒤 공백) ·
   *    **진척률 초기값** · **댓글 수 초기값**. 갈린 순간 *"드래그로 만든 것과
   *    버튼으로 만든 것이 다르다"* 가 되고, 그 차이는 만든 뒤에야 보이므로
   *    아무도 재현을 못 합니다.
   *
   * 🔴 **기간은 `null` 일 수 있습니다.** 그러면 `toGanttEvents` 가 그 항목을
   *    건너뛰어 **트리에 줄만 생기고 막대는 없습니다.** 나중에 데스크톱에서 그
   *    줄을 끌면 기간이 붙습니다(`handleSelectSlot`).
   */
  const createItem = React.useCallback(
    (input: {
      /** 🔴 비어 있지 않은 이름 — 비었는지는 폼이 먼저 막습니다 */
      title: string;
      start: string | null;
      end: string | null;
      color: GanttColorKey | null;
    }) => {
      const tempId = newTempId();
      const created: ProjectItemCard = {
        id: tempId,
        /* 🔴 **정규화의 정본은 서버(`projectItemSchema.title` 의 `.trim()`)입니다.**
           여기서 한 번 더 깎는 것은 규칙을 두 벌 두려는 것이 아니라, **낙관적으로
           그리는 줄이 곧 저장될 값과 같아야** 하기 때문입니다 — 안 깎으면 새로고침
           전까지 트리 줄만 앞뒤 공백을 갖고 있고, 그 차이는 아무도 못 봅니다.
           ⚠️ 그래서 규칙이 갈리면 **여기가 틀린 쪽**입니다. 서버를 고치고 이 줄을
              맞추십시오(반대가 아닙니다). */
        title: input.title.trim(),
        start: input.start,
        end: input.end,
        progress: 0,
        color: input.color,
        // 방금 만든 항목에 댓글이 있을 수 없습니다. 서버도 같은 값을 돌려줍니다.
        commentCount: 0,
        /* 🔴 **만들 때는 미배정입니다.** 만들기 폼에 담당자 칸을 두지 않은 것은
           색에 대해 한 결정과 같습니다 — 새 항목의 첫 질문은 «누가» 가 아니라
           «무엇을 언제» 입니다. */
        assigneeId: null,
      };

      const before = items;
      const next = [...items, created];
      setItems(next);

      const rollback = (message: string) => {
        setItems((prev) => revertSave(prev, before, next));
        toast.error(message);
      };

      void createProjectItemAction(projectId, projectSlug, {
        title: created.title,
        startsOn: created.start,
        endsOn: created.end,
        progress: created.progress,
        /* 🔴 **안 보내면 색이 저장되지 않습니다.** 화면에는 낙관적으로 이미
           칠해져 있으므로 그 실수는 **새로고침해야** 보입니다. 스키마가 이 칸을
           필수로 둔 것이 그것을 컴파일 시점으로 끌어온 것입니다. */
        color: created.color,
        assigneeId: created.assigneeId,
      })
        .then((r) => {
          if (!r.ok) {
            rollback(r.message ?? "항목을 만들지 못했습니다.");
            return;
          }
          /* 🔴 **서버가 준 id 로 그 줄만 갈아 끼웁니다.** 통째로 다시 읽지
             않습니다 — 그러면 정본이 둘이 됩니다(파일 머리말). 함수형 갱신인
             것은 그 사이에 다른 저장이 성공했을 수 있기 때문입니다. */
          setItems((prev) =>
            prev.map((i) => (i.id === tempId ? { ...i, id: r.data.id } : i))
          );
        })
        .catch(() => rollback("항목을 만들지 못했습니다."));
    },
    [items, projectId, projectSlug]
  );

  /**
   * 🔴 **못 놓는 자리** — 프로젝트 기간 밖.
   *
   * ⚠️ 이 콜백 하나로는 **못 막습니다.** 벤더 기본값에서 `canDropEvent` 는
   *    *"고스트를 빨갛게 칠하는"* 조언일 뿐이고 커밋 관문은 `onEventUpdate`
   *    입니다(`gantt.tsx` 의 `enforceCanDrop` 주석). 그래서 `enforceCanDrop` 을
   *    켜 판정을 구속력 있게 만들고, `onEventUpdate` 에서 한 번 더 봅니다 —
   *    키보드·API 경로는 드래그 릴리스 관문을 지나지 않습니다.
   */
  const canDropEvent = (u: GanttProposedUpdate<string>) =>
    !outsideProjectSpan(project, fromBarRange(u.start, u.end));

  /** 이동·리사이즈 저장 */
  const handleEventUpdate = (u: GanttProposedUpdate<string>) => {
    const id = u.event.data;
    const item = id === undefined ? undefined : items.find((i) => i.id === id);
    if (item === undefined || id === undefined) return false;
    if (!guardSaved(item)) return false;
    const span = fromBarRange(u.start, u.end);
    if (outsideProjectSpan(project, span)) {
      toast.info("프로젝트 기간 밖으로는 옮길 수 없습니다.");
      return false;
    }
    runSave(
      items.map((i) =>
        i.id === id ? { ...i, start: span.start, end: span.end } : i
      ),
      () =>
        patchProjectItemAction(projectId, id, projectSlug, {
          startsOn: span.start,
          endsOn: span.end,
        }),
      "항목을 옮기지 못했습니다."
    );
    /* 🔴 수락을 명시합니다. 계약은 `gantt-types.tsx` 에 적혀 있습니다 —
     *"false = reject/revert; void or true = accept"*. */
    return true;
  };

  /**
   * 빈 트랙 드래그가 만들 수 있는 자리인가.
   *
   * 🔴 **줄을 가리지 않습니다.** ReUI 의 힌트 타일은 줄마다 나오는데 그 표시는
   *    `canSelectSlot` 을 보지 않습니다 — 여기서 특정 줄만 막으면 **힌트가
   *    약속한 일이 안 일어나는 줄**이 생깁니다. 그래서 판정은 기간 하나뿐이고,
   *    *어느 항목이 되는가*는 `onSelectSlot` 이 정합니다.
   */
  const canSelectSlot = (draft: GanttSlotDraft) =>
    !outsideProjectSpan(project, fromBarRange(draft.start, draft.end));

  /**
   * 빈 트랙 드래그 → **「항목 추가」 대화**.
   *
   * 🔴 **먼저 묻고, 확인해야 만듭니다.** *"먼저 만들고 이름만 이어서 묻는다"* 는
   *    길도 있었지만 그러면 사용자가 「취소」를 눌렀는데 항목이 남습니다 — 그
   *    버튼은 취소가 아닙니다.
   * 🔴 **기간 없는 항목에 기간을 주는 갈래는 다릅니다.** 그 길은 만드는 것이
   *    아니라 **고치는 것**이고, 거기서는 «취소» 라는 개념이 없습니다(누르는
   *    즉시 저장이고 실패하면 롤백됩니다 — 이동·리사이즈와 같은 규약).
   */
  const handleSelectSlot = (draft: GanttSlotDraft) => {
    const span = fromBarRange(draft.start, draft.end);
    if (outsideProjectSpan(project, span)) {
      toast.info("프로젝트 기간 밖에는 만들 수 없습니다.");
      return;
    }
    const target = draft.resourceId;
    const dateless =
      target === undefined || target === NEW_ITEM_ROW
        ? undefined
        : items.find((i) => i.id === target && itemSpan(i) === null);
    if (dateless !== undefined) {
      // 기간이 없어 막대가 없던 항목입니다 — 새로 만들지 않고 **그 항목에 기간을 줍니다.**
      if (!guardSaved(dateless)) return;
      runSave(
        items.map((i) =>
          i.id === dateless.id ? { ...i, start: span.start, end: span.end } : i
        ),
        () =>
          patchProjectItemAction(projectId, dateless.id, projectSlug, {
            startsOn: span.start,
            endsOn: span.end,
          }),
        "기간을 정하지 못했습니다."
      );
      return;
    }
    /* 🔴 **아직 아무것도 안 만듭니다.** 끌어 놓은 기간만 폼에 심어 엽니다 —
       확인하면 `submitNewItem` 이 `createItem` 을 부르고, 취소하면 그것으로
       끝입니다. ⚠️ 그동안 놓은 자리는 **미리보기 막대**로 남습니다. */
    setAdding({ ...EMPTY_ITEM_FORM, start: span.start, end: span.end });
  };

  /**
   * 「항목 추가」 폼의 저장.
   *
   * 🔴 **기간이 비어 있어도 만듭니다** — 그것이 이 길의 요점입니다. 폼의 `""` 를
   *    `null` 로 바꿔 넘기면 `createItem` 이 나머지를 드래그와 똑같이 합니다.
   * ⚠️ **기간을 준 경우에만 프로젝트 기간 밖을 막습니다.** 드래그로는 애초에
   *    기간 밖에 못 그리는데 버튼으로는 되면, 만들자마자 **옮기지도 못하는
   *    막대**가 생깁니다. 한쪽만 채운 항목은 애초에 막대가 없으므로 잴 것이
   *    없습니다.
   */
  const submitNewItem = (v: NewItemValue) => {
    const start = v.start || null;
    const end = v.end || null;
    // 거꾸로 된 기간은 저장 전에 막습니다 — 스키마도 거절하지만, 액션이 거절하면
    // 화면은 「입력값을 확인해 주세요」만 보여 줍니다.
    if (spanReversed(start, end)) {
      toast.error("끝이 시작보다 앞섭니다.");
      return;
    }
    if (
      start !== null &&
      end !== null &&
      outsideProjectSpan(project, { start, end })
    ) {
      // 폼을 닫지 않습니다 — 날짜만 고치면 되는 자리입니다.
      toast.info("프로젝트 기간 밖에는 만들 수 없습니다.");
      return;
    }
    setAdding(null);
    createItem({ title: v.title, start, end, color: v.color });
  };

  /**
   * 🔴 **진척률은 사람이 찍습니다.** 눈금은 `PROGRESS_STEPS` 입니다.
   * ⛔ 날짜에서 계산하지 않습니다 — 손은 안 가지만 *"일이 되고 있다"* 를 뜻하지
   *    않습니다. 카드의 「오늘 위치」(`project-span.ts`)와는 **다른 값**이고,
   *    섞으면 숫자가 거짓말합니다.
   */
  const changeProgress = React.useCallback(
    (item: ProjectItemCard, step: number) => {
      if (item.progress === step) return;
      if (!guardSaved(item)) return;
      runSave(
        items.map((i) => (i.id === item.id ? { ...i, progress: step } : i)),
        () =>
          patchProjectItemAction(projectId, item.id, projectSlug, {
            progress: step,
          }),
        "진척률을 바꾸지 못했습니다."
      );
    },
    [items, projectId, projectSlug, runSave, guardSaved]
  );

  /**
   * 🎨 **막대 색** (`FR-PROJ-014`).
   *
   * 🔴 **저장하는 것은 우리 키**(`"blue"`)입니다 — CSS 값이 아닙니다. 벤더가
   *    `event.color` 를 `--gantt-event-color` 커스텀 속성에 그대로 꽂으므로,
   *    CSS 값을 저장하면 벤더의 속이 DB 에 굳고 DB 문자열이 CSS 로 샙니다
   *    (`schema.ts` 의 색 머리말).
   * 🔴 `null` = **안 정함**. 「지운다」가 아니라 *"내가 안 골랐다"* 이고, 그때 색을
   *    정하는 것은 벤더입니다(`?? var(--color-primary)`).
   */
  const changeColor = React.useCallback(
    (item: ProjectItemCard, color: GanttColorKey | null) => {
      if (item.color === color) return;
      if (!guardSaved(item)) return;
      runSave(
        items.map((i) => (i.id === item.id ? { ...i, color } : i)),
        () =>
          patchProjectItemAction(projectId, item.id, projectSlug, { color }),
        "색을 바꾸지 못했습니다."
      );
    },
    [items, projectId, projectSlug, runSave, guardSaved]
  );

  /**
   * 담당자 지정·해제 (`FR-PROJ-013`) — 🔴 **색 바꾸기와 같은 모양입니다**
   * (낙관적 갱신 + 실패 되돌림). 두 경로가 같은 `runSave` 를 지나므로
   * «저장 실패» 의 처리가 한 곳입니다.
   * ⚠️ 검사(맡길 수 있는 사람인가)는 **서버가 합니다** — 화면이 목록에서 고르게
   *    하지만, 액션은 주소만 알면 부를 수 있습니다
   *    (`project-item.service.assertAssignable`).
   */
  const assign = React.useCallback(
    (item: ProjectItemCard, assigneeId: string | null) => {
      if (item.assigneeId === assigneeId) return;
      if (!guardSaved(item)) return;
      runSave(
        items.map((i) => (i.id === item.id ? { ...i, assigneeId } : i)),
        () =>
          patchProjectItemAction(projectId, item.id, projectSlug, {
            assigneeId,
          }),
        "담당자를 바꾸지 못했습니다."
      );
    },
    [items, projectId, projectSlug, runSave, guardSaved]
  );

  const rename = (title: string) => {
    const target = renaming;
    if (target === null) return;
    const clean = title.trim();
    if (!clean) {
      toast.error("이름을 적어 주세요.");
      return;
    }
    setRenaming(null);
    if (!guardSaved(target)) return;
    runSave(
      items.map((i) => (i.id === target.id ? { ...i, title: clean } : i)),
      () =>
        patchProjectItemAction(projectId, target.id, projectSlug, {
          title: clean,
        }),
      "이름을 바꾸지 못했습니다."
    );
  };

  const remove = async () => {
    const target = deleting;
    if (target === null) return;
    if (!guardSaved(target)) return;
    setBusy(true);
    const r = await deleteProjectItemAction(projectId, target.id, projectSlug);
    setBusy(false);
    if (!r.ok) {
      toast.error(r.message ?? "항목을 지우지 못했습니다.");
      return;
    }
    setDeleting(null);
    /* 🔴 **함수형 갱신입니다.** `items.filter(…)` 는 `await` 앞의 렌더가 본
       목록이라, 대화가 떠 있는 동안 도착한 갱신(댓글 수·다른 저장의 롤백)을
       **되돌려 놓습니다.** `prev` 에서 이 항목 하나만 뺍니다. */
    setItems((prev) => prev.filter((i) => i.id !== target.id));
  };

  /**
   * 막대의 오른쪽 클릭 메뉴. 벤더가 모든 막대를 `ContextMenu` 로 감싸 두고
   * 여기서 반환한 것을 그 내용으로 씁니다.
   *
   * 🔴 `useCallback` 으로 참조를 붙듭니다. 이 값은 **뷰 설정**이라 바뀌면
   *    컨텍스트가 새 값이 되고 **모든 줄이 다시 그려집니다.**
   */
  const renderEventMenu = React.useCallback(
    ({ occurrence }: GanttRenderEventProps<string>) => {
      const id = occurrence.event.data;
      const item =
        id === undefined ? undefined : items.find((i) => i.id === id);
      if (item === undefined) return null;
      return (
        <>
          <ContextMenuItem onSelect={() => setRenaming(item)}>
            이름 바꾸기
          </ContextMenuItem>
          <ContextMenuSeparator />
          {/*
            🔄 **진척률과 색을 좌우 두 칸으로 세웁니다.** 세로로 쌓으면 메뉴가
               **열여섯 줄**이 됩니다(진척률 5 + 색 11). 좌우로 접으면 가장 긴
               쪽이 다섯 줄이라 메뉴 높이가 3분의 1이 됩니다.

            🔢 **폭을 짐작으로 두지 않습니다.** 이 메뉴의 폭은 **더해서 221px**
               이고 출처가 전부 여기 있습니다:
                 4(`p-1`) + 80(`w-20` 진척률) + 4(`gap-1`) + 1(구분선) + 4(`gap-1`)
                 + 124(`COLOR_GRID_W`) + 4(`p-1`) = **221px**
               ⚠️ 벤더가 씌운 `ContextMenuContent` 의 `min-w-44`(176px)는
                  **최소값**이라 이 값을 안 자릅니다.
               ⚠️ 진척률 칸 80px 의 근거: `pl-1.5`(6) + `pr-8`(32, 우리 ui
                  컴포넌트가 체크 표시를 놓는 자리)를 빼면 글자에 42px 이 남고,
                  가장 긴 `100%` 가 text-sm 에서 그 안입니다.
          */}
          <div className="flex gap-1">
            <div className="w-20 shrink-0">
              <ContextMenuLabel>진척률</ContextMenuLabel>
              <ContextMenuRadioGroup
                value={String(item.progress)}
                onValueChange={(v) => changeProgress(item, Number(v))}
              >
                {PROGRESS_STEPS.map((step) => (
                  <ContextMenuRadioItem key={step} value={String(step)}>
                    {step}%
                  </ContextMenuRadioItem>
                ))}
              </ContextMenuRadioGroup>
            </div>
            <div aria-hidden className="bg-border w-px shrink-0 self-stretch" />
            <div className={cn(COLOR_GRID_W, "shrink-0")}>
              <ContextMenuLabel>색</ContextMenuLabel>
              {/* 🎨 색 — 🔴 위 진척률과 **같은 꼴**입니다(라디오 묶음 하나).
                  🔴 줄의 목록은 `COLOR_CHOICES` **하나**에서 옵니다 — ⋯ 메뉴·만들기
                     폼과 같은 배열입니다. 「안 정함」이 그 첫 칸이고, 없으면 한 번
                     고른 색을 **영영 못 지웁니다.** */}
              <ContextMenuRadioGroup
                className="grid grid-cols-4 gap-1"
                value={item.color ?? NO_COLOR}
                onValueChange={(v) =>
                  changeColor(item, v === NO_COLOR ? null : toGanttColorKey(v))
                }
              >
                {COLOR_CHOICES.map((c) => (
                  <ContextMenuRadioItem
                    key={c.value}
                    value={c.value}
                    data-color={c.value}
                    aria-label={c.label}
                    title={c.label}
                    className={COLOR_SWATCH_CELL}
                  >
                    <ColorSwatch color={c.key} />
                  </ContextMenuRadioItem>
                ))}
              </ContextMenuRadioGroup>
            </div>
          </div>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onSelect={() => setDeleting(item)}
          >
            삭제
          </ContextMenuItem>
        </>
      );
    },
    [items, changeProgress, changeColor]
  );

  /**
   * 댓글 수가 바뀌면 그 줄만 갈아 끼웁니다 (`DEC-074`).
   *
   * 🔴 **정본은 여전히 이 화면의 상태입니다**(파일 머리말) — 댓글 대화가
   *    서버에서 받은 수를 여기로 되돌려 주고, 트리의 배지는 그 값을 그립니다.
   *    서버를 다시 읽지 않는 이유도 같습니다: `router.refresh()` 를 부르면
   *    프롭이 새로 내려와 **낙관적 갱신과 두 정본**이 됩니다.
   */
  const setCommentCount = React.useCallback((itemId: string, count: number) => {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, commentCount: count } : i))
    );
  }, []);

  /**
   * 트리의 이름칸.
   *
   * 🔴 **자리를 막대가 아니라 이름칸으로 고른 근거가 둘입니다:**
   *    ① **기간이 없는 항목은 막대가 아예 없습니다**(`toGanttEvents` 가
   *       건너뜁니다) — 막대에 두면 그런 항목에는 열 길이 하나도 없습니다.
   *       트리 줄은 언제나 있습니다.
   *    ② 막대는 좁습니다. 진척률 색·이름이 이미 그 폭을 쓰고 있습니다.
   * 🔴 **간트는 사람을 직접 안 그립니다.** 여기서 하는 일은 전용 컴포넌트를
   *    **여는 것**뿐이고, 얼굴·이니셜은 그 안에서만 그려집니다.
   */
  const renderResourceLabel = React.useCallback(
    ({ resource }: { resource: GanttResource }) => {
      /* 🔴 **빈 줄은 진짜 버튼입니다.** 문제는 **항목처럼 생겼는데 항목이 아닌
         것**이었으므로, 지우는 대신 **하는 일**을 이름으로 주고 실제로 그 일을
         하게 했습니다.
         ⚠️ 여기 `<button>` 을 두는 것이 줄 클릭과 안 부딪힙니다 — 벤더의 줄
            핸들러가 `closest("button, [role=checkbox]")` 로 버튼을 **일부러
            비껴갑니다.** 그리고 `handleResourceClick` 도 이 줄을 같은 곳으로
            보내므로, 줄 어디를 눌러도 결과가 같습니다.
         ⛔ ⋯ 도 댓글도 안 붙습니다 — 항목이 아니라 어포던스입니다.
         🔴 **그래도 항목과 구별돼야 합니다.** 셋이 그 일을 나눠 맡습니다 —
            셋 다 항목 줄에는 **없는** 것들입니다: ① `text-muted-foreground`
            (항목 이름은 본문색) ② `＋` 아이콘 ③ **가운데 정렬**. */
      if (resource.id === NEW_ITEM_ROW) {
        return (
          <button
            type="button"
            data-slot="add-item-row"
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -my-0.5 flex min-w-0 flex-1 items-center justify-center gap-1 rounded px-1.5 py-0.5 text-center transition focus-visible:ring-2 focus-visible:outline-none"
            onClick={() => setAdding(EMPTY_ITEM_FORM)}
          >
            <Plus className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{resource.title}</span>
          </button>
        );
      }
      const item = items.find((i) => i.id === resource.id);
      /* 미리보기 줄은 아직 항목이 아닙니다 — `items` 에 없으므로 여기로
         떨어집니다. ⋯ 도 댓글도 붙일 것이 없고, 대화가 닫히면 줄째 사라집니다. */
      if (item === undefined) {
        return (
          <span className="text-muted-foreground truncate">
            {resource.title}
          </span>
        );
      }
      return (
        <span
          data-slot="item-row-label"
          /*
            🔄 **왼쪽 빈 자리를 되찾습니다.**
            🔴 그 여백은 우리 것이 아니라 **벤더의 고정 거터**입니다
               (`gantt-view.tsx`: *"fixed gutter: groups toggle here, leaves carry
               the checkbox"* — `w-5` + `me-1` = 정확히 24px). 이 화면에는 그 안에
               들어갈 것이 **하나도 없습니다**: 트리가 한 겹이라(«그룹» 이 없어)
               펼침 화살표가 안 나고, `rowCheckboxes={false}` 라 체크박스도 없습니다.
            ⚠️ **전제 둘이 무너지면 겹칩니다**: ① 트리에 그룹이 생기거나
               ② `rowCheckboxes` 를 켜면 그 자리에 진짜 컨트롤이 서고, 이 줄이
               그 위를 덮습니다. 그때는 이 클래스를 지우는 것이 맞습니다.
          */
          className="group/row -ms-6 flex min-w-0 flex-1 items-center gap-1.5"
        >
          {/* 🔴 **순서가 얼굴 → 제목 → 댓글입니다.**
              🔴 **담당자가 없어도 자리는 남습니다** — 안 그러면 담당자가 있는
                 줄과 없는 줄에서 **제목의 시작점이 어긋납니다.**
              ⚠️ 벤더의 `renderResourceMenu` 는 **우클릭** 메뉴라 보이지
                 않습니다 — 보이는 ⋯ 버튼은 이 안에 우리가 만들고, 아래에서
                 **줄의 오른쪽 끝**에 세웁니다. */}
          <ItemAssignee
            assigneeId={item.assigneeId}
            people={people}
            canWrite
            onAssign={(next) => assign(item, next)}
          />
          <span className="truncate">{resource.title}</span>
          <ProjectItemComments
            projectId={projectId}
            item={item}
            onCountChange={setCommentCount}
            /* 🔴 열림을 화면이 갖습니다 — 줄 클릭과 이 배지가 **같은 창**을 엽니다 */
            open={commenting === item.id}
            onOpenChange={(v) => setCommenting(v ? item.id : null)}
          />
          {/* 🔴 **⋯ 는 줄의 오른쪽 끝입니다.**
              🔴 **기간 없는 항목의 유일한 경로입니다** — 그런 항목은 막대가 아예
                 없어서 막대 우클릭 메뉴에 닿을 길이 없습니다.
              ⚠️ **제목이 길어도 ⋯ 는 안 밀립니다** — 제목은 `truncate` 로 줄고
                 ⋯ 는 `shrink-0` 입니다. 미는 것은 `ms-auto` 하나입니다. */}
          <ItemRowMenu
            item={item}
            onRename={setRenaming}
            onColor={changeColor}
            /* 🔴 **막대 우클릭 메뉴와 같은 것을 넘깁니다** — 두 입구가 한
               `setDeleting` 으로 모여 **같은 확인 대화**로 갑니다. */
            onDelete={setDeleting}
          />
        </span>
      );
    },
    [items, commenting, changeColor, setCommentCount, assign, people, projectId]
  );

  /**
   * 🔴 **트리 줄을 누르면 댓글이 열립니다.**
   *
   * 🔴 **드래그와 안 부딪힙니다 — 근거는 「그 줄은 안 끌린다」입니다.** 벤더의
   *    줄 재정렬은 `reorderEnabled = !!settings.onResourceReorder` 하나로
   *    켜지고, 손잡이조차 그 값일 때만 그려집니다. 우리는 그 콜백을 **안
   *    넘깁니다** — 그래서 트리 줄에는 붙잡을 제스처가 없고, 남는 것은 누름
   *    하나뿐입니다.
   * ⚠️ **버튼은 벤더가 비껴갑니다** — `closest("button, [role=checkbox]")`.
   *    그래서 ⋯ 와 댓글 배지를 **여는** 누름은 이 콜백에 안 걸립니다.
   *
   * 🔴 **그것만으로는 모자랍니다.** ⋯ 메뉴의 **항목을 고르면** 댓글 창이 함께
   *    열립니다. 원인은 React 입니다: Radix 는 메뉴 내용을 `document.body` 로
   *    포털하지만, **이벤트는 DOM 트리가 아니라 React 트리를 타고 올라갑니다** —
   *    그 메뉴는 `renderResourceLabel` 안에 있으므로 줄의 `onClick` 이 자기
   *    자식으로 여깁니다. 그리고 메뉴 항목은 `<div role="menuitem">` 이라 벤더의
   *    버튼 걸러내기도 지나갑니다. 같은 함정이 이 줄 안의 **댓글 대화** 내용에도
   *    그대로 있습니다.
   * 🔴 **그래서 「이 줄의 DOM 에서 시작한 누름인가」로 잽니다.** 포털된 내용은
   *    줄의 DOM 자손이 아니므로 `closest("[data-gantt-row-id]")` 가 비고, 줄
   *    자신·이름·배지는 전부 그 안에 있습니다.
   *    ⛔ 포털마다 `stopPropagation` 을 뿌리지 않습니다 — 포털이 하나 늘 때마다
   *       잊는 자리가 하나 늡니다.
   */
  const handleResourceClick = React.useCallback(
    ({ resource }: { resource: GanttResource }, e: React.MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-gantt-row-id]") == null) return;
      // 빈 줄은 항목이 아닙니다 — 줄 어디를 눌러도 「항목 추가」입니다.
      if (resource.id === NEW_ITEM_ROW) {
        setAdding(EMPTY_ITEM_FORM);
        return;
      }
      // 미리보기 줄에는 열 댓글이 없습니다(아직 항목이 아닙니다).
      if (items.some((i) => i.id === resource.id)) setCommenting(resource.id);
    },
    [items]
  );

  const renderNoResources = React.useCallback(() => EMPTY_ITEMS_HINT, []);

  /** 막대를 두 번 누르면 이름을 묻습니다 — 메뉴를 몰라도 이름을 고칠 길이 있어야 합니다 */
  const openRename = React.useCallback(
    (occurrence: GanttOccurrence<string>) => {
      const id = occurrence.event.data;
      const item =
        id === undefined ? undefined : items.find((i) => i.id === id);
      if (item !== undefined) setRenaming(item);
    },
    [items]
  );

  return (
    <>
      {/*
        🔴 **간트는 부모 높이를 채우는 구조입니다**(`flex min-h-0 flex-1`) —
           부모에 높이가 없으면 0px 이 되어 통째로 사라집니다. 그래서 **어느
           폭에서도** 이 칸에 확정된 높이가 있어야 합니다.

        🔴 **고정 픽셀을 쓰지 않습니다.** 27인치에서도 560px 이면 화면 아래가
           통째로 빕니다. 대신 폭에 따라 두 갈래로 높이를 얻습니다:
           - **데스크톱(≥1280)**: 상세 화면의 `<section>` 이 뷰포트를 채우고,
             여기서 `flex-1 min-h-0` 으로 **남는 높이를 전부** 먹습니다.
           - **좁은 폭(<1280)**: 부모 높이가 **없습니다**(좁은 폭에서는 본문
             전체가 구릅니다). 여기서 `flex-1` 을 그대로 두면 basis 0 이라 카드가
             **0px 로 짜부라집니다.** 그래서 `max-xl:flex-none` 으로 사슬을 끊고
             뷰포트 비율로 섭니다.

        ⚠️ `70dvh` 는 **고정 픽셀이 아니라 뷰포트 비율**입니다(`vh` 가 아니라
           `dvh` — 모바일 주소창이 접혔다 펴지면 `vh` 는 실제 보이는 높이보다
           큽니다). 나머지 30% 는 위의 머리말과 페이지 스크롤 몫입니다.

        🔴 `overflow-hidden` 은 그대로 둡니다 — 간트가 자체 스크롤을 둘 갖고
           있어 카드가 또 구르면 스크롤이 두 겹이 됩니다.
      */}
      <Card
        data-slot="project-timeline"
        ref={cardRef}
        className="min-h-0 flex-1 overflow-hidden p-0 max-xl:h-[70dvh] max-xl:flex-none"
      >
        <Gantt<string>
          className="h-full"
          events={ganttEvents}
          resources={ganttNodes}
          interactions={canDrag ? INTERACTIONS_ON : INTERACTIONS_OFF}
          classNames={GANTT_CLASS_NAMES}
          /* 🔴 **이름 칸을 패널 폭에 맞춥니다.** 안 주면 벤더 기본값이 208 이라
             288 짜리 패널 뒤에 80px 이 남고 ⋯ 가 트리 오른쪽 끝에 못 붙습니다. */
          treePanel={treePanel}
          /* 🔴 **UTC 로 못 박습니다.** 우리 날짜는 `date` 컬럼이고 service 가 UTC
             자정으로 만들어 넘깁니다(`features/projects/ymd` 머리말) — 서울
             시간대로 돌리면 그 자정이 09:00 으로 읽혀 **막대가 하루의 3분의
             1만큼 밀립니다.** 하루 단위 일정에 시간대는 값이 없습니다. */
          timeZone="UTC"
          locale={GANTT_LOCALE}
          i18n={GANTT_I18N}
          defaultScale={initialScale}
          defaultDate={initialDate}
          /* 스냅과 최소 길이를 **하루**로 못 박습니다.
             ⚠️ **오늘은 둘 다 아무 일도 안 합니다** — 이 값을 읽는 경로는
                `"day"` 스케일 하나뿐이고 우리는 그 스케일을 열지 않습니다
                (`PROJECT_SCALES`).
             🔴 **그래도 적어 둡니다.** 언젠가 `PROJECT_SCALES` 에 `"day"` 를
                더하는 사람이 생기면 스냅이 조용히 15분으로 떨어지고, 그때
                저장되는 것은 자정이 아닌 끝입니다 — 화면에는 아무 오류도 안
                뜹니다. 값이 0인 보험이라 그냥 듭니다. */
          snapDuration={DAY_MINUTES}
          slotDuration={DAY_MINUTES}
          /* 🔴 **보이는 범위를 프로젝트 기간으로 묶습니다.** 없으면 무한이라 한
             달짜리 프로젝트에서도 화면이 몇 해씩 굴러갑니다.
             ⚠️ 기간이 없으면 `undefined` 가 가고, 그러면 벤더는 지금까지처럼
                무한입니다. */
          rangeBounds={rangeBounds}
          enforceCanDrop={true}
          canDropEvent={canDropEvent}
          onEventUpdate={handleEventUpdate}
          canSelectSlot={canSelectSlot}
          onSelectSlot={handleSelectSlot}
          onEventDoubleClick={openRename}
          /* 🔴 둘 다 `canDrag` 를 봅니다 — 어포던스를 제스처와 **같은 값**에 겁니다.
             ⚠️ `displayScheduleHint` 는 벤더가 이미 `interactions.selectSlot` 과
                AND 로 묶어 두었지만, 그 결합에 **기대지 않습니다**. 벤더가 한 줄
                바뀌면 못 쓰는 힌트만 조용히 되살아나는 종류의 의존입니다. */
          dragCreate={canDrag}
          displayScheduleHint={canDrag}
          scheduleMode="single"
          rowCheckboxes={false}
          renderEventMenu={renderEventMenu}
          renderResourceLabel={renderResourceLabel}
          renderNoResources={renderNoResources}
          /* 🔴 트리 줄을 누르면 댓글 · 빈 줄이면 「항목 추가」 */
          onResourceClick={handleResourceClick}
        >
          <GanttNav>
            {/* 🔴 **`TooltipProvider` 를 우리가 세웁니다.** `GanttNav` 는 자기
                **기본** 자식일 때만 그것을 감싸 줍니다(`gantt-nav.tsx` 의
                `children ?? (…)`) — children 을 주는 순간 그 감싸기가 통째로
                사라지고, 나머지 nav 버튼들은 Radix Tooltip 을 쓰므로 화면이
                *"`Tooltip` must be used within `TooltipProvider`"* 로 **죽습니다.** */}
            <TooltipProvider delayDuration={600} skipDelayDuration={300}>
              {/* 🔴 **셋이 그대로 삽니다** — 원본은 기간 축 모드에서 이 셋을
                  감춥니다(축이 곧 기간이라 셋 다 화면을 못 바꿔서). 우리는 그
                  축을 못 가져왔으므로(모델 머리말) 축이 달력 단위이고, 셋 다
                  실제로 화면을 바꿉니다 — 감추면 **기간 밖으로 나간 막대를 보러
                  갈 길이 없어집니다.** */}
              <GanttNavToday />
              {/* 🔴 `"일"` 스케일은 안 엽니다 — 하루짜리 창이라 여러 날 막대를
                  못 보여 줍니다(`PROJECT_SCALES` 주석). */}
              <GanttScaleSwitcher scales={PROJECT_SCALES} />
              <div className="flex items-center">
                <GanttNavPrev />
                <GanttNavNext />
              </div>
              <GanttTitle />
              <div className="grow" />
              {/*
                🔴 **「항목 추가」 — 발견 가능한 생성 경로.** 드래그 생성은 그대로
                   살아 있습니다. 이건 대체가 아니라 **보이는 길 하나**입니다.
                🔴 **폭 조건을 걸지 않습니다.** 좁은 폭에서 드래그를 끄면 폰에는
                   항목을 만들 길이 **아예 없어집니다** — 여기에 `canDrag` 도
                   `max-xl:hidden` 도 붙지 않습니다. 붙는 순간 그 구멍이 돌아옵니다.
                ⚠️ **자리는 nav 입니다.** `GanttNav` 는 `flex-wrap` 이라 좁은 폭에서
                   버튼이 다음 줄로 접힐 뿐 사라지지 않습니다. 상세 머리말에 두는
                   길도 있었지만 그쪽은 서버 컴포넌트이고, 항목의 정본은 이 화면의
                   상태라(머리말) 올리면 상태를 통째로 끌어올려야 합니다.
              */}
              <Button
                data-slot="add-project-item"
                size="sm"
                className="font-semibold"
                onClick={() => setAdding(EMPTY_ITEM_FORM)}
              >
                <Plus className="size-4" /> {ADD_ITEM_LABEL}
              </Button>
            </TooltipProvider>
          </GanttNav>
          <GanttView />
        </Gantt>
      </Card>

      {/* 🔴 **값이 여기서 옵니다** — 미리보기 막대가 같은 값을 읽어야 해서입니다.
          닫는 것은 `setAdding(null)` 하나이고, 그것이 곧 미리보기를 지우는 일입니다. */}
      <AddItemDialog
        value={adding}
        onChange={setAdding}
        onSubmit={submitNewItem}
      />

      <RenameDialog
        item={renaming}
        onClose={() => setRenaming(null)}
        onSubmit={rename}
      />

      {/* 🔴 삭제는 되돌릴 수 없습니다 — 두 입구(막대 우클릭 · 트리 ⋯)가 한
          `setDeleting` 으로 모여 이 하나로 옵니다. 실제로 지우는 것은 위
          `remove` 이고, 대화는 자기 저장을 갖지 않습니다. */}
      <DeleteItemDialog
        item={deleting}
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void remove()}
      />
    </>
  );
}
