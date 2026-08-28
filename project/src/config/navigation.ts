import {
  BookMarked,
  Database,
  FolderTree,
  LayoutDashboard,
  ListChecks,
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
  badge?: number;
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

export const serviceLibraryGroup: NavGroup = {
  label: "내 서재",
  items: [
    { title: "컬렉션", href: "/collections", icon: FolderTree },
    { title: "북마크", href: "/bookmarks", icon: BookMarked },
  ],
};

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
