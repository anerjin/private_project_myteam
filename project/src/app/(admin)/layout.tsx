import { redirect } from "next/navigation";

import { Breadcrumbs } from "@/components/common/breadcrumbs";
import { SiteHeader } from "@/components/layout/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ROLE_LABEL } from "@/config/site";
import { SessionSwitcher } from "@/features/auth/components/session-switcher";
import { getMockSession } from "@/features/auth/mock-session";
import { adminBreadcrumbLabels } from "@/app/_shell/breadcrumb-labels";
import { AdminSidebar } from "@/app/_shell/sidebar";
import { toSearchItems } from "@/features/resources/search-items";
import { notifications, resources, stats } from "@/mocks";

export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const session = await getMockSession();

  // 인가 2계층: 레이아웃에서 세션을 다시 확인한다 (REQ-02 · 2.9절)
  if (session.role !== "ADMIN") redirect("/403");

  return (
    <SidebarProvider>
      <AdminSidebar
        user={{
          name: session.name,
          username: session.username,
          department: session.department,
          roleLabel: ROLE_LABEL[session.role],
        }}
        badges={{
          "/admin/members": stats.pendingMembers,
          "/admin/resources": stats.needsReview,
          "/admin/jobs": stats.failedJobs,
        }}
      />
      <SidebarInset>
        {/* 관리자 영역임을 알리는 상단 색상 띠 (DEV-03 · 3.4절) */}
        <div className="h-1 shrink-0 bg-amber-500" />
        <SiteHeader
          title="관리자"
          searchItems={toSearchItems(resources)}
          notifications={notifications}
          actions={<SessionSwitcher />}
        />
        <main className="flex-1 space-y-6 p-4 md:p-6 lg:p-8">
          <Breadcrumbs labels={adminBreadcrumbLabels()} />
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
