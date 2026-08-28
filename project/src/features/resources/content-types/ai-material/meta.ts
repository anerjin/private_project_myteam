import { Sparkles } from "lucide-react";

import type { ContentTypeMeta } from "@/features/resources/content-types/types";
import type { AiMaterialDetail } from "@/types";

export const meta: ContentTypeMeta = {
  code: "AI_MATERIAL",
  slug: "ai-material",
  label: "AI 자료",
  description: "논문 · 아티클 · 영상 · 모델 · 서비스 소개",
  icon: Sparkles,
  badgeClass:
    "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  showInNav: true,
  sortOrder: 10,
  isActive: true,
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
