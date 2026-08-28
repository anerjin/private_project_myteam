import { FileText } from "lucide-react";

import type { ContentTypeMeta } from "@/features/resources/content-types/types";
import type { DevNoteDetail } from "@/types";

export const meta: ContentTypeMeta = {
  code: "DEV_NOTE",
  slug: "dev-note",
  label: "개발 노트",
  description: "사내 규약 · 팁 · 트러블슈팅 기록",
  icon: FileText,
  badgeClass: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  showInNav: true,
  sortOrder: 50,
  isActive: true,
};

export const NOTE_KIND_LABEL: Record<DevNoteDetail["noteKind"], string> = {
  CONVENTION: "규약",
  TROUBLESHOOT: "문제해결",
  TIP: "팁",
  RETRO: "회고",
};
