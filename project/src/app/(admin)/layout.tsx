import { Breadcrumbs } from "@/components/common/breadcrumbs";
import { SiteHeader } from "@/components/layout/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { requireActiveUser } from "@/server/auth/guards";
import { adminBreadcrumbLabels } from "@/app/_shell/breadcrumb-labels";
import { AdminSidebar } from "@/app/_shell/sidebar";
import { toSearchItems } from "@/features/resources/search-items";
import * as notify from "@/server/services/notification.service";
import * as resourceService from "@/server/services/resource.service";

export default async function AdminLayout({ children }: LayoutProps<"/">) {
  /*
   * **여기서 인가를 판정하지 않습니다** (`DEC-035`).
   *
   * Next.js 16 의 Partial Rendering 때문에 레이아웃은 클라이언트 네비게이션에서
   * 재실행되지 않고, 레이아웃의 `redirect()` 는 page 세그먼트 렌더를 멈추지 못해
   * **관리 데이터가 RSC Payload 에 실려 나갈 수 있습니다.**
   * 차단은 `(admin)` 아래 **각 page** 의 `requireActiveUser()` 가 합니다
   * (`npm run check:guards`).
   * (경로에 글로브를 쓰면 `*` 와 `/` 가 붙어 이 주석이 조기 종료됩니다 — 메모리 [017])
   *
   * 여기서 가드를 부르는 것은 **셸을 그릴 세션 정보를 얻기 위해서**이고,
   * 리다이렉트는 부수 효과일 뿐 이것에 기대지 않습니다.
   */
  /*
   * ## 이 그룹은 이제 «등급»으로 막히지 않습니다 (`DEC-077`)
   *
   * 전에는 `requireRole("ADMIN")` 이었고, 「`EDITOR` 에게 열어 봤다가 되돌렸다」는
   * 실측 기록이 여기 있었습니다(레이아웃을 낮추면 `page` 의 `redirect()` 가
   * **307 이 아니라 200 + 클라이언트 리다이렉트**가 되어 `/admin/members` 가 200 으로
   * 응답했습니다). **그 실측은 여전히 유효합니다** — 다만 지금은 낮출 등급이 없어서
   * 재현할 수 없습니다. 그래서 규칙만 남깁니다:
   *
   * > **레이아웃을 page 보다 «약하게» 만들지 마십시오.** 등급이 다시 생기는 날
   * > 그 실측이 그대로 돌아옵니다.
   *
   * 지금 `(admin)` 과 `(service)` 를 가르는 것은 권한이 아니라 **셸**입니다 —
   * 사이드바 메뉴가 다르고 상단에 주황 띠가 있습니다.
   */
  const session = await requireActiveUser();
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
      <AdminSidebar
        user={{
          name: session.name,
          username: session.username,
          department: session.department,
        }}
      />
      <SidebarInset>
        {/* 관리자 영역임을 알리는 상단 색상 띠 (DEV-03 · 3.4절) */}
        <div className="h-1 shrink-0 bg-amber-500" />
        <SiteHeader
          title="관리자"
          searchItems={toSearchItems(recentResources)}
          notifications={notifications}
          actions={<SignOutButton />}
        />
        <main className="flex-1 space-y-6 p-4 md:p-6 lg:p-8">
          {/* 관리자 영역은 아직 타이틀을 헤더로 옮기지 않았다. 본문 PageHeader 가 h1 을 낸다 */}
          <Breadcrumbs labels={await adminBreadcrumbLabels()} heading={false} />
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
