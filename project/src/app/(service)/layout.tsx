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
// 자료·알림은 아직 목이다 — P4 에서 `src/mocks/` 를 지운다 (DEV-07 · 7.4)
import { notifications, resources } from "@/mocks";

export default async function ServiceLayout({ children }: LayoutProps<"/">) {
  // 셸을 그릴 세션 정보를 얻습니다. **차단은 각 page 가 합니다** (DEC-035).
  const session = await requireActiveUser();
  // 관리자에게만 보이는 배지다. 일반 회원 요청에서 세지 않는다.
  const pendingCount =
    session.role === "ADMIN" ? await memberService.countPending() : 0;

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
          breadcrumb={<Breadcrumbs labels={serviceBreadcrumbLabels()} />}
          searchItems={toSearchItems(resources)}
          notifications={notifications}
          actions={<SignOutButton />}
        />
        <main className="flex-1 space-y-6 p-4 md:p-6 lg:p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
