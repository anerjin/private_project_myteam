import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";

import type { Resource, ResourceDetail, ResourceType } from "@/types";

/**
 * 콘텐츠 타입 정의.
 *
 * 타입 하나에 필요한 모든 것(라벨·아이콘·카드·상세·폼)을 **폴더 하나에 모으고**
 * 레지스트리마다 한 줄 등록합니다 (`FR-TYPE-008`). 새 타입을 추가할 때 고칠
 * 파일은 그 폴더와 네 레지스트리뿐이고, **하나라도 빠뜨리면 컴파일이
 * 실패합니다** — 전부 탈출구 없는 `Record<ResourceType, …>` 입니다 (`DEC-051`).
 *
 * 정본: REQ-04 · 4.9절 / DEV-06 · 6.5절
 */
export interface ContentTypeDefinition {
  code: ResourceType;
  /** URL 세그먼트 — `/resources/{slug}` */
  slug: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** 배지 색 (DEV-04 · 4.4절) */
  badgeClass: string;

  /**
   * 운영 설정의 **기본값** (`FR-ADM-014`).
   *
   * > 전에는 *"지금은 상수지만 실제 구현에서는 `content_type_settings` 에서
   * > 읽습니다"* 였습니다. **`P4` 가 그것을 만들었습니다** — `DEC-032` 대로
   * > 표현은 코드, 운영 설정은 DB 이고 병합은 `content-type.service` 가 합니다.
   * > 여기 값은 **행이 없을 때 쓰는 기본값**입니다.
   */
  showInNav: boolean;
  sortOrder: number;
  isActive: boolean;

  /** URL 빠른 등록의 타입 추정 (FR-RES-005) */
  detectFromUrl?: (url: string) => boolean;

  /** 목록 카드 하단 한 줄 */
  Card: ComponentType<{ resource: Resource }>;
  /** 상세 화면의 타입 전용 블록 (`FR-TYPE-003`) */
  Detail: ComponentType<{ resource: Resource }>;
  /** 등록·수정 폼의 타입 전용 필드 (`FR-TYPE-002`) */
  Form: ComponentType<{ detail?: ResourceDetail }>;
}

/** 각 타입 폴더의 `meta.ts` 가 내보내는 부분 */
export type ContentTypeMeta = Omit<
  ContentTypeDefinition,
  "Card" | "Detail" | "Form"
>;
