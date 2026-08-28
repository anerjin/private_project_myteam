import { GitBranch } from "lucide-react";

import type { ContentTypeMeta } from "@/features/resources/content-types/types";

export const meta: ContentTypeMeta = {
  code: "GITHUB_REPO",
  slug: "github-repo",
  label: "GitHub 저장소",
  description: "오픈소스 저장소 메타 + 소스 아카이브",
  icon: GitBranch,
  badgeClass:
    "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  showInNav: true,
  sortOrder: 20,
  isActive: true,
  detectFromUrl: (url) => /github\.com\/[^/]+\/[^/]+/i.test(url),
};
