"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Fragment } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { BREADCRUMB_ROOT, PATH_LABEL, SEGMENT_LABEL } from "@/config/navigation";

/**
 * 모든 화면 공통 브레드크럼 (DEV-03 · 3.4절).
 * 사이드바 토글 오른쪽, 헤더 **한 줄**에 들어갑니다.
 *
 * 경로에서 자동으로 만들되, 동적 세그먼트(자료 slug · 회원 id 등)는
 * 서버 레이아웃이 `labels` 맵으로 넘겨 줍니다. `components` 는 `features` 를
 * 참조할 수 없으므로(DEV-06 · 6.9절) 데이터는 반드시 prop 으로 받습니다.
 *
 * **마지막 조각이 곧 페이지 타이틀이고, 그 문서의 유일한 `<h1>` 입니다.**
 * 본문에 같은 제목을 또 두면 화면에 같은 글자가 두 번 나오고 h1 도 둘이 됩니다.
 */
export function Breadcrumbs({
  labels,
  heading = true,
}: {
  labels?: Record<string, string>;
  /**
   * 현재 조각을 `<h1>` 으로 낼지. 아직 타이틀을 헤더로 옮기지 않은
   * **관리자 영역만** `false` 로 둡니다 (본문 `PageHeader` 가 h1 을 내므로).
   */
  heading?: boolean;
}) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  const root =
    segments[0] === "admin" ? BREADCRUMB_ROOT.admin : BREADCRUMB_ROOT.service;

  const crumbs: { href: string; label: string }[] = [];
  let href = "";
  for (const segment of segments) {
    href += `/${segment}`;
    if (href === root.href) continue;
    crumbs.push({
      href,
      label:
        PATH_LABEL[href] ??
        labels?.[segment] ??
        SEGMENT_LABEL[segment] ??
        segment,
    });
  }

  // 루트 화면(`/dashboard`·`/admin`)에서는 루트 조각 자체가 현재 페이지다
  const rootIsCurrent = crumbs.length === 0;

  return (
    <Breadcrumb>
      {/*
        헤더는 h-14 한 줄이다. 줄바꿈을 막고(flex-nowrap), 좁은 화면에서는
        조상 조각을 감춰 현재 페이지 이름만 남긴다.
      */}
      <BreadcrumbList className="flex-nowrap">
        <BreadcrumbItem
          className={rootIsCurrent ? "min-w-0" : "hidden shrink-0 md:inline-flex"}
        >
          {rootIsCurrent ? (
            <CurrentPage label={root.label} heading={heading} />
          ) : (
            <BreadcrumbLink asChild>
              <Link href={root.href}>{root.label}</Link>
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>

        {crumbs.map((crumb, i) => {
          const isCurrent = i === crumbs.length - 1;
          return (
            <Fragment key={crumb.href}>
              <BreadcrumbSeparator className="hidden shrink-0 md:block" />
              <BreadcrumbItem
                className={
                  isCurrent ? "min-w-0" : "hidden shrink-0 md:inline-flex"
                }
              >
                {isCurrent ? (
                  <CurrentPage label={crumb.label} heading={heading} />
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href}>{crumb.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/**
 * 현재 페이지 조각 = 페이지 타이틀 = 이 문서의 `<h1>`.
 * 자료 제목처럼 긴 이름은 잘리므로 `title` 로 전체를 볼 수 있게 둔다.
 */
function CurrentPage({ label, heading }: { label: string; heading: boolean }) {
  const Tag = heading ? "h1" : "span";
  return (
    <Tag
      aria-current="page"
      title={label}
      className="text-foreground truncate text-sm font-medium"
    >
      {label}
    </Tag>
  );
}
