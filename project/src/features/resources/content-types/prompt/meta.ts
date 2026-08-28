import { MessageSquareQuote } from "lucide-react";

import type { ContentTypeMeta } from "@/features/resources/content-types/types";

export const meta: ContentTypeMeta = {
  code: "PROMPT",
  slug: "prompt",
  label: "프롬프트",
  description: "잘 동작한 프롬프트 템플릿",
  icon: MessageSquareQuote,
  badgeClass: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  showInNav: true,
  sortOrder: 60,
  isActive: true,
};
