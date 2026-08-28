import { Breadcrumbs } from "@/components/common/breadcrumbs";
import { SiteHeader } from "@/components/layout/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ROLE_LABEL } from "@/config/site";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { requireActiveUser } from "@/server/auth/guards";
import { serviceBreadcrumbLabels } from "@/app/_shell/breadcrumb-labels";
import { ServiceSidebar } from "@/app/_shell/sidebar";
import { toSearchItems } from "@/features/resources/search-items";
import { notifications, resources, stats } from "@/mocks";

export default async function ServiceLayout({ children }: LayoutProps<"/">) {
  // 셸을 그릴 세션 정보를 얻습니다. **차단은 각 page 가 합니다** (DEC-035).
  const session = await requireActiveUser();

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
        pendingCount={stats.pendingMembers}
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
