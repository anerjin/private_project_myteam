"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Fragment } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { BREADCRUMB_ROOT, PATH_LABEL, SEGMENT_LABEL } from "@/config/navigation";

/**
 * 모든 화면 공통 브레드크럼 (DEV-03 · 3.4절).
 *
 * 경로에서 자동으로 만들되, 동적 세그먼트(자료 slug · 회원 id 등)는
 * 서버 레이아웃이 `labels` 맵으로 넘겨 줍니다. `components` 는 `features` 를
 * 참조할 수 없으므로(DEV-06 · 6.9절) 데이터는 반드시 prop 으로 받습니다.
 */
export function Breadcrumbs({ labels }: { labels?: Record<string, string> }) {
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

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          {crumbs.length === 0 ? (
            <BreadcrumbPage>{root.label}</BreadcrumbPage>
          ) : (
            <BreadcrumbLink asChild>
              <Link href={root.href}>{root.label}</Link>
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>
        {crumbs.map((crumb, i) => (
          <Fragment key={crumb.href}>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {i === crumbs.length - 1 ? (
                <BreadcrumbPage className="max-w-[24rem] truncate">
                  {crumb.label}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link href={crumb.href}>{crumb.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
