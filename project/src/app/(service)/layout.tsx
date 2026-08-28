import { Breadcrumbs } from "@/components/common/breadcrumbs";
import { SiteHeader } from "@/components/layout/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ROLE_LABEL } from "@/config/site";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { requireActiveUser } from "@/server/auth/guards";
import { serviceBreadcrumbLabels } from "@/app/_shell/breadcrumb-labels";
import { ServiceSidebar } from "@/app/_shell/sidebar";
import { toSearchItems } from "@/features/resources/search-items";
import * as memberService from "@/server/services/member.service";
import * as notify from "@/server/services/notification.service";
import * as resourceService from "@/server/services/resource.service";

export default async function ServiceLayout({ children }: LayoutProps<"/">) {
  // 셸을 그릴 세션 정보를 얻습니다. **차단은 각 page 가 합니다** (DEC-035).
  const session = await requireActiveUser();
  // 관리자에게만 보이는 배지다. 일반 회원 요청에서 세지 않는다.
  const pendingCount =
    session.role === "ADMIN" ? await memberService.countPending() : 0;

  /*
   * **벨과 배지는 다른 숫자를 셉니다. 의도입니다** (`DEC-038`).
   * - 사이드바 배지 = `users where status = PENDING` — 「지금의 사실」
   * - 헤더 벨 = 안 읽은 `notifications` — 「내가 읽었는가」
   * 관리자가 셋이면 배지는 셋 다 같고 벨은 각자 다릅니다.
   * **하나로 합치면 배지가 읽음 처리에 따라 사라집니다.**
   */
  /*
   * 커맨드 팔레트(Ctrl+K) 후보. **최근 것 8건만** 싣습니다 —
   * 전체를 실으면 1만 건이 매 요청 RSC 페이로드로 나갑니다.
   * 팔레트 안에서 검색하는 것은 `P4` 남은 범위(서버 검색 연결)이고,
   * 지금은 「최근 자료로 바로 가기」입니다.
   */
  const recent = await resourceService.list(
    { sort: "recent" },
    { kind: "cursor", size: 8 },
    session.userId
  );
  const recentResources = recent.items;

  const rows = await notify.listFor(session.userId, 20);
  const notifications = rows.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body ?? undefined,
    read: n.readAt !== null,
  }));

  return (
    <SidebarProvider>
      <ServiceSidebar
        user={{
          name: session.name,
          username: session.username,
          department: session.department,
          roleLabel: ROLE_LABEL[session.role],
        }}
        isAdmin={session.role === "ADMIN"}
        pendingCount={pendingCount}
      />
      <SidebarInset>
        <SiteHeader
          breadcrumb={<Breadcrumbs labels={await serviceBreadcrumbLabels()} />}
          searchItems={toSearchItems(recentResources)}
          notifications={notifications}
          actions={<SignOutButton />}
        />
        <main className="flex-1 space-y-6 p-4 md:p-6 lg:p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
