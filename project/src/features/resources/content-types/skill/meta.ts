import { FileCode2 } from "lucide-react";

import type { ContentTypeMeta } from "@/features/resources/content-types/types";

export const meta: ContentTypeMeta = {
  code: "SKILL",
  slug: "skill",
  label: "Skill",
  description: "AI 에이전트 Skill 정의와 사용법",
  icon: FileCode2,
  badgeClass:
    "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  showInNav: true,
  sortOrder: 40,
  isActive: true,
};
