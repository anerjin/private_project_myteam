"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SECTIONS } from "@/features/projects/schema";
import { cn } from "@/lib/utils";

/**
 * 프로젝트 안의 이동 (`FR-PROJ-005`).
 *
 * **기획·디자인·개발이 «별도 메뉴»입니다** — 운영자 요구 그대로입니다.
 * 한 화면에 세 구획을 접어 두는 방식도 있었지만, 그러면 문서가 늘었을 때
 * 스크롤 한 판이 되고 「어느 구획을 보고 있는지」가 사라집니다.
 *
 * `usePathname` 으로 «지금 어디»를 판정합니다. 서버에서 내려 주면 레이아웃이
 * 통째로 클라이언트가 되거나, 안 그러려고 각 page 가 자기 탭을 그리게 됩니다.
 */
export function ProjectTabs({
  slug,
  counts,
}: {
  slug: string;
  counts: { docs: number; tasks: number };
}) {
  const pathname = usePathname();
  const base = `/projects/${slug}`;

  const tabs = [
    { href: base, label: "개요", exact: true },
    ...SECTIONS.map((s) => ({
      href: `${base}/docs/${s.slug}`,
      label: s.label,
      exact: false,
    })),
    { href: `${base}/tasks`, label: "일정", exact: false, n: counts.tasks },
  ];

  return (
    <div className="flex flex-wrap gap-2 border-b">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              active
                ? "border-foreground font-medium"
                : "text-muted-foreground border-transparent hover:text-foreground"
            )}
          >
            {t.label}
            {"n" in t && t.n !== undefined && (
              <span className="ml-1.5 tabular-nums">{t.n}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
