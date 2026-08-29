// QueenBee 도메인 타입
// 정본: _docs/01.요구사항/04_콘텐츠_도메인_모델.md (REQ-04)

export type ResourceType =
  | "AI_MATERIAL"
  | "GITHUB_REPO"
  | "MCP_SERVER"
  | "SKILL"
  | "DEV_NOTE"
  | "PROMPT";

export type ResourceStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type SourceChannel = "WEB" | "MCP" | "IMPORT";

export type Role = "MEMBER" | "EDITOR" | "ADMIN";
export type UserStatus =
  "PENDING" | "ACTIVE" | "REJECTED" | "SUSPENDED" | "WITHDRAWN";

/** 자료 간 관계 (`FR-RES-012`) — 한 행을 «양쪽에서» 읽는다 */
export type RelationType = "RELATED" | "SOURCE_OF" | "SUPERSEDES" | "PART_OF";

export type JobStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED";
/** `prisma/schema.prisma` 의 `JobType` 과 같아야 한다 — 화면·서비스가 함께 읽는다 */
export type JobType =
  | "FETCH_URL_META"
  | "FETCH_GITHUB_META"
  | "ARCHIVE_GITHUB"
  | "REFRESH_GITHUB_META"
  | "CHECK_LINK"
  | "GENERATE_THUMBNAIL"
  | "CLEANUP_TRASH";
export type UsageStatus = "REVIEWING" | "ADOPTED" | "DEPRECATED";

export interface Author {
  id: string;
  username: string;
  name: string;
  department: string;
}

/** 타입별 상세 — REQ-04 · 4.4절 */
export interface AiMaterialDetail {
  materialKind: "PAPER" | "ARTICLE" | "VIDEO" | "MODEL" | "SERVICE" | "COURSE";
  sourceName?: string;
  authors?: string[];
  publishedAt?: string;
  language?: "KO" | "EN" | "ETC";
  readingTime?: number;
  keyPoints?: string;
  applicability?: string;
}

export interface GithubRepoDetail {
  owner: string;
  repo: string;
  stars?: number;
  forks?: number;
  primaryLanguage?: string;
  license?: string;
  /** `github_repos.topics` (text[]). metadata JSONB 가 아니다 — REQ-04 · 4.4 */
  topics?: string[];
  pushedAt?: string;
  latestRelease?: string;
  archiveStatus: "NONE" | "QUEUED" | "RUNNING" | "DONE" | "FAILED";
  /** 표시용 캐시. 정본은 files.size_bytes (role=ARCHIVE) — DEV-02 · 2.7 */
  archiveSizeBytes?: number;
  archivedSha?: string;
  isGone: boolean;
}

export interface McpServerDetail {
  packageName?: string;
  transport: "STDIO" | "SSE" | "HTTP";
  installCommand?: string;
  configJson: string;
  envVars?: {
    key: string;
    description: string;
    required: boolean;
    /** 값이 아니라 «형태» 예시만. 실제 토큰은 저장하지 않는다 (NFR-SEC-008) */
    example?: string;
  }[];
  providedTools?: { name: string; description: string }[];
  clientSupport?: string[];
  usageStatus: UsageStatus;
}

export interface SkillDetail {
  skillName: string;
  /** Skill 정의 원문(마크다운). REQ-04 · 4.4 에서 필수 — PROMPT 의 promptText 와 같은 자리 */
  definition: string;
  triggerCondition: string;
  usageExample: string;
  targetClients?: string[];
  usageStatus: UsageStatus;
  version?: string;
}

export interface DevNoteDetail {
  noteKind: "CONVENTION" | "TROUBLESHOOT" | "TIP" | "RETRO";
  relatedProject?: string;
  occurredAt?: string;
}

export interface PromptDetail {
  promptText: string;
  useCase: string;
  targetModel?: string;
  variables?: { name: string; description: string }[];
  usageStatus: UsageStatus;
}

export type ResourceDetail =
  | ({ type: "AI_MATERIAL" } & AiMaterialDetail)
  | ({ type: "GITHUB_REPO" } & GithubRepoDetail)
  | ({ type: "MCP_SERVER" } & McpServerDetail)
  | ({ type: "SKILL" } & SkillDetail)
  | ({ type: "DEV_NOTE" } & DevNoteDetail)
  | ({ type: "PROMPT" } & PromptDetail);

/**
 * 카테고리 (`REQ-04 · 4.2`). **정본은 `categories` 테이블**이고 계층은
 * `parent_id` 자기 참조로 표현합니다 — 깊이는 2단계까지입니다.
 */
export interface CategoryOption {
  slug: string;
  name: string;
}

export interface CategoryNode extends CategoryOption {
  /** lucide 아이콘명. 없으면 화면이 아이콘을 그리지 않는다 */
  icon: string | null;
  children: CategoryOption[];
}

/** `<Select>` 는 계층을 못 그리므로 평평하게 펴고 `depth` 로 들여쓴다 */
export interface CategoryChoice extends CategoryOption {
  depth: 0 | 1;
}

/** 자료 — 모든 콘텐츠의 공통 뼈대 */
export interface Resource {
  id: string;
  type: ResourceType;
  slug: string;
  title: string;
  summary?: string;
  body?: string;
  url?: string;
  status: ResourceStatus;
  sourceChannel: SourceChannel;
  category?: string;
  /**
   * 카테고리 이름. **slug 와 같은 행에서 옵니다** — 화면이 slug 로 이름을
   * 찾으려면 어딘가에 「slug → 이름」 표를 두게 되고, 그 표가 곧 목이 됩니다
   * (`config/site.ts` 의 `CATEGORIES` 가 그렇게 살아남았습니다).
   */
  categoryName?: string;
  tags: string[];
  author: Author;
  viewCount: number;
  bookmarkCount: number;
  bookmarked?: boolean;
  createdAt: string;
  updatedAt: string;
  detail: ResourceDetail;
}

export interface Member {
  id: string;
  username: string;
  name: string;
  department: string;
  role: Role;
  status: UserStatus;
  signupReason?: string;
  statusReason?: string;
  resourceCount: number;
  apiKeyCount: number;
  createdAt: string;
  lastLoginAt?: string;
}

export interface Job {
  id: string;
  type:
    | "FETCH_URL_META"
    | "FETCH_GITHUB_META"
    | "ARCHIVE_GITHUB"
    | "REFRESH_GITHUB_META"
    | "CHECK_LINK"
    | "CLEANUP_TRASH";
  status: JobStatus;
  targetTitle?: string;
  attempts: number;
  durationMs?: number;
  requestedBy: string;
  errorMessage?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorUsername: string;
  via: "WEB" | "MCP";
  action: string;
  targetType?: string;
  summary: string;
  ip: string;
  createdAt: string;
  /** 변경 전·후. 값이 있는 행만 diff 패널을 펼칠 수 있다 */
  diff?: Record<string, { before: string | null; after: string | null }>;
}

export interface Collection {
  id: string;
  name: string;
  slug: string;
  description?: string;
  visibility: "PRIVATE" | "TEAM";
  owner: Author;
  itemCount: number;
  updatedAt: string;
}

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt?: string;
  expiresAt: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body?: string;
  read: boolean;
  createdAt: string;
}
