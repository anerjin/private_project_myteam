"use client";

import { AppSidebar } from "@/components/layout/app-sidebar";
import type { NavUserData } from "@/components/layout/nav-user";
import {
  adminEntry,
  adminNav,
  serviceHomeGroup,
  serviceLibraryGroup,
  serviceProjectGroup,
} from "@/config/navigation";
import { buildResourceNavGroup, type NavType } from "@/features/resources/nav";

/**
 * 메뉴를 조립해 표현 컴포넌트(`components/layout/app-sidebar`)에 넘긴다.
 *
 * **왜 클라이언트 컴포넌트인가:** 메뉴 항목의 `icon` 은 React 컴포넌트(함수)다.
 * 서버 → 클라이언트로 함수를 prop 으로 넘길 수 없으므로 조립을 클라이언트 안에서 한다.
 * 사용자·배지 같은 **직렬화 가능한 데이터만** 서버에서 받는다.
 *
 * **왜 `app/_shell` 인가:** 여러 feature 를 엮는 조립 코드다. `features/A → features/B`
 * 는 금지이므로(DEV-06 · 6.9절) 조립은 app 계층에서 한다. `_` 접두 폴더는
 * 라우팅에서 제외된다(Next.js private folder).
 */
export function ServiceSidebar({
  user,
  navTypes,
}: {
  user: NavUserData;
  /** 노출 여부·순서는 서버가 판정해서 넘긴다 (`DEC-032`) */
  navTypes: NavType[];
}) {
  const groups = [
    serviceHomeGroup,
    buildResourceNavGroup(navTypes),
    // 모아 둔 자료와 내 것 «사이» — 팀이 지금 하는 일입니다 (`DEC-069`)
    serviceProjectGroup,
    serviceLibraryGroup,
  ];

  return (
    <AppSidebar
      variant="service"
      groups={groups}
      user={user}
      /* 🔄 `isAdmin ? adminEntry : undefined` 였습니다. `DEC-077` 로 등급이
         사라져 **관리 영역 입구가 항상 보입니다** — 들어가는 사람이 곧 관리자입니다. */
      adminEntry={adminEntry}
    />
  );
}

/**
 * 관리 사이드바.
 *
 * **등급으로 거르지 않습니다** — 관리 영역이 통째로 `ADMIN` 이라(`DEC-057`)
 * 여기 오는 사람은 전부 다 볼 수 있습니다. 거르는 장치를 잠깐 뒀다가
 * 뺐습니다: 아무것도 안 거르는 필터는 다음 사람에게 **등급별 메뉴가 있다**고
 * 믿게 합니다.
 */
export function AdminSidebar({ user }: { user: NavUserData }) {
  /*
   * **배지를 받지 않습니다** (`DEC-077`). 유일한 숫자가 「승인 대기 N건」이었고
   * 가입 신청이 사라지면서 셀 것이 없어졌습니다. 「언젠가 쓸지 모르니」로
   * `badges` 를 남겨 두면 항상 `{}` 를 넘기는 인자가 되고, 다음 사람은
   * **어딘가 배지가 뜨는 줄** 압니다.
   */
  return <AppSidebar variant="admin" groups={adminNav} user={user} />;
}
