import {
  BookMarked,
  CircleUserRound,
  Database,
  FolderKanban,
  FolderTree,
  GanttChartSquare,
  LayoutDashboard,
  ListChecks,
  NotebookPen,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

/**
 * 정적 메뉴만 둡니다.
 * **자료 메뉴는 콘텐츠 타입 레지스트리에서 만들어** 라우트 레이아웃이 합칩니다
 * (`features/resources/nav.ts`). `config` 는 `features` 를 참조할 수 없기 때문입니다.
 */
export const serviceHomeGroup: NavGroup = {
  items: [{ title: "대시보드", href: "/dashboard", icon: LayoutDashboard }],
};

/**
 * 프로젝트 (`FR-PROJ-*` · `DEC-069`).
 *
 * **자료 메뉴와 내 서재 «사이»에 둡니다.** 위는 모아 둔 자료이고 아래는 내
 * 것인데, 프로젝트는 **팀이 지금 하는 일**이라 성격이 다릅니다 — 자료 타입
 * 목록에 섞으면 「프로젝트도 자료의 한 종류」로 읽힙니다. 그게 정확히
 * `DEC-069` 가 아니라고 말한 것입니다.
 *
 * 자료 메뉴와 달리 **레지스트리에서 만들지 않습니다.** 콘텐츠 타입이 아니라
 * 늘어나지 않는 고정 메뉴입니다.
 */
export const serviceProjectGroup: NavGroup = {
  label: "프로젝트",
  items: [
    { title: "전체 프로젝트", href: "/projects", icon: FolderKanban },
    { title: "내 할 일", href: "/projects/my-tasks", icon: GanttChartSquare },
  ],
};

export const serviceLibraryGroup: NavGroup = {
  label: "내 서재",
  items: [
    { title: "컬렉션", href: "/collections", icon: FolderTree },
    { title: "북마크", href: "/bookmarks", icon: BookMarked },
    /*
     * **나만 보는 메모** (`FR-NOTE-001`). 앞의 둘과 달리 자료를 «담는» 것이
     * 아니라 **직접 쓰는** 것입니다 — 그래서 아이콘도 폴더·책갈피가 아니라
     * 펜입니다.
     */
    { title: "나의 노트", href: "/notes", icon: NotebookPen },
    /*
     * **만들어 둔 캐릭터를 모아 두는 자리** (`features/avatars/catalog.ts`).
     * 자료도 메모도 아니라 «내 것으로 고를 그림」이라 아이콘도 사람 모양입니다.
     */
    { title: "아바타", href: "/avatars", icon: CircleUserRound },
  ],
};

/**
 * 관리 메뉴.
 *
 * 🔄 **「전부 `ADMIN`」이었습니다** (`DEC-057`). 등급별로 거르는 장치를 잠깐
 * 두었다가 뺐던 자리이고, `DEC-077` 로 등급 자체가 없어져 **거를 것이 두 번째로
 * 없어졌습니다.** 이 메뉴가 보이는 조건은 이제 「로그인했는가」 하나입니다.
 *
 * 아무것도 안 하는 장치를 남겨 두면 다음 사람이 「등급별 메뉴가 있다」고 믿습니다.
 */
export const adminNav: NavGroup[] = [
  {
    items: [{ title: "관리자 홈", href: "/admin", icon: LayoutDashboard }],
  },
  {
    label: "관리",
    items: [
      { title: "회원 관리", href: "/admin/members", icon: Users },
      { title: "자료 관리", href: "/admin/resources", icon: Database },
      { title: "분류 · 타입", href: "/admin/taxonomy", icon: FolderTree },
    ],
  },
  {
    label: "운영",
    items: [
      { title: "작업 모니터", href: "/admin/jobs", icon: ListChecks },
      { title: "감사 로그", href: "/admin/audit-logs", icon: ScrollText },
      { title: "시스템 설정", href: "/admin/settings", icon: Settings },
    ],
  },
];

/**
 * 브레드크럼 세그먼트 라벨 (DEV-03 · 3.4절 공통 요소).
 * 동적 세그먼트(자료 slug, 회원 id 등)는 레이아웃이 `labels` 로 넘깁니다.
 */
export const SEGMENT_LABEL: Record<string, string> = {
  dashboard: "대시보드",
  resources: "자료",
  new: "등록",
  edit: "수정",
  collections: "컬렉션",
  bookmarks: "북마크",
  notes: "나의 노트",
  projects: "프로젝트",
  "my-tasks": "내 할 일",
  plan: "기획",
  design: "디자인",
  dev: "개발",
  tasks: "일정",
  docs: "문서",
  avatars: "아바타",
  search: "검색",
  me: "마이페이지",
  admin: "관리자",
  members: "회원 관리",
  taxonomy: "분류 · 타입",
  jobs: "작업 모니터",
  "audit-logs": "감사 로그",
  settings: "시스템 설정",
};

/** 같은 세그먼트라도 경로에 따라 이름이 다른 경우 */
export const PATH_LABEL: Record<string, string> = {
  "/admin/resources": "자료 관리",
};

export const BREADCRUMB_ROOT = {
  service: { href: "/dashboard", label: "대시보드" },
  admin: { href: "/admin", label: "관리자 홈" },
} as const;

export const adminEntry: NavItem = {
  title: "관리자",
  href: "/admin",
  icon: ShieldCheck,
};
