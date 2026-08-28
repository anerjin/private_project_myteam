import { Breadcrumbs } from "@/components/common/breadcrumbs";
import { SiteHeader } from "@/components/layout/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ROLE_LABEL } from "@/config/site";
import { SessionSwitcher } from "@/features/auth/components/session-switcher";
import { getMockSession } from "@/features/auth/mock-session";
import { serviceBreadcrumbLabels } from "@/app/_shell/breadcrumb-labels";
import { ServiceSidebar } from "@/app/_shell/sidebar";
import { toSearchItems } from "@/features/resources/search-items";
import { notifications, resources, stats } from "@/mocks";

export default async function ServiceLayout({ children }: LayoutProps<"/">) {
  const session = await getMockSession();

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
          searchItems={toSearchItems(resources)}
          notifications={notifications}
          actions={<SessionSwitcher />}
        />
        <main className="flex-1 space-y-6 p-4 md:p-6 lg:p-8">
          <Breadcrumbs labels={serviceBreadcrumbLabels()} />
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
