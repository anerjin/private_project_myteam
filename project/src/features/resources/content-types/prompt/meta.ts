import { MessageSquareQuote } from "lucide-react";

import type { ContentTypeMeta } from "@/features/resources/content-types/types";
import { OPERATIONAL } from "@/features/resources/content-types/operational";

export const meta: ContentTypeMeta = {
  // 운영 사실(코드·slug·라벨·노출·순서)은 operational.ts 한 곳에 있다 (DEC-032).
  // 여기 남는 것은 **표현**뿐이다 — 아이콘·배지 색·URL 추정.
  ...OPERATIONAL.PROMPT,
  icon: MessageSquareQuote,
  badgeClass: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};
