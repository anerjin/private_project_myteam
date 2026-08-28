import { Bot } from "lucide-react";

import type { ContentTypeMeta } from "@/features/resources/content-types/types";

export const meta: ContentTypeMeta = {
  code: "MCP_SERVER",
  slug: "mcp-server",
  label: "MCP 서버",
  description: "사내에서 쓰는 MCP 서버 설치 · 설정 정보",
  icon: Bot,
  badgeClass:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  showInNav: true,
  sortOrder: 30,
  isActive: true,
};
