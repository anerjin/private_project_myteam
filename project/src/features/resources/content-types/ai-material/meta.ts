import { Sparkles } from "lucide-react";

import type { ContentTypeMeta } from "@/features/resources/content-types/types";
import { OPERATIONAL } from "@/features/resources/content-types/operational";
import type { AiMaterialDetail } from "@/types";

export const meta: ContentTypeMeta = {
  // 운영 사실(코드·slug·라벨·노출·순서)은 operational.ts 한 곳에 있다 (DEC-032).
  // 여기 남는 것은 **표현**뿐이다 — 아이콘·배지 색·URL 추정.
  ...OPERATIONAL.AI_MATERIAL,
  icon: Sparkles,
  badgeClass:
    "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  detectFromUrl: (url) =>
    /(arxiv\.org|youtube\.com|youtu\.be|\.pdf($|\?))/i.test(url),
};

export const MATERIAL_KIND_LABEL: Record<
  AiMaterialDetail["materialKind"],
  string
> = {
  PAPER: "논문",
  ARTICLE: "아티클",
  VIDEO: "영상",
  MODEL: "모델",
  SERVICE: "서비스·제품",
  COURSE: "강의",
};

export const LANGUAGE_LABEL = {
  KO: "한국어",
  EN: "영어",
  ETC: "기타",
} as const;
