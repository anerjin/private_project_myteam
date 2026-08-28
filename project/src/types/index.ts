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
  | "PENDING"
  | "ACTIVE"
  | "REJECTED"
  | "SUSPENDED"
  | "WITHDRAWN";

export type JobStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED";
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
  topics?: string[];
  pushedAt?: string;
  latestRelease?: string;
  archiveStatus: "NONE" | "QUEUED" | "RUNNING" | "DONE" | "FAILED";
  archiveSizeMb?: number;
  archivedSha?: string;
  isGone: boolean;
}

export interface McpServerDetail {
  packageName?: string;
  transport: "STDIO" | "SSE" | "HTTP";
  installCommand?: string;
  configJson: string;
  envVars?: { key: string; description: string; required: boolean }[];
  providedTools?: { name: string; description: string }[];
  clientSupport?: string[];
  usageStatus: UsageStatus;
}

export interface SkillDetail {
  skillName: string;
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
  needsReview: boolean;
  category?: string;
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
