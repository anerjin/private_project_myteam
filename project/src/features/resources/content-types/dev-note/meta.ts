import { FileText } from "lucide-react";

import type { ContentTypeMeta } from "@/features/resources/content-types/types";
import { OPERATIONAL } from "@/features/resources/content-types/operational";
import type { DevNoteDetail } from "@/types";

export const meta: ContentTypeMeta = {
  // 운영 사실(코드·slug·라벨·노출·순서)은 operational.ts 한 곳에 있다 (DEC-032).
  // 여기 남는 것은 **표현**뿐이다 — 아이콘·배지 색·URL 추정.
  ...OPERATIONAL.DEV_NOTE,
  icon: FileText,
  badgeClass: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
};

export const NOTE_KIND_LABEL: Record<DevNoteDetail["noteKind"], string> = {
  CONVENTION: "규약",
  TROUBLESHOOT: "문제해결",
  TIP: "팁",
  RETRO: "회고",
};
