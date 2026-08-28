-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('MEMBER', 'EDITOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('AI_MATERIAL', 'GITHUB_REPO', 'MCP_SERVER', 'SKILL', 'DEV_NOTE', 'PROMPT');

-- CreateEnum
CREATE TYPE "ResourceStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SourceChannel" AS ENUM ('WEB', 'MCP', 'IMPORT');

-- CreateEnum
CREATE TYPE "ActorVia" AS ENUM ('WEB', 'MCP');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('TEAM', 'PRIVATE');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('OK', 'MOVED', 'GONE');

-- CreateEnum
CREATE TYPE "FileRole" AS ENUM ('ATTACHMENT', 'ARCHIVE', 'THUMBNAIL');

-- CreateEnum
CREATE TYPE "RelationType" AS ENUM ('RELATED', 'SOURCE_OF', 'SUPERSEDES', 'PART_OF');

-- CreateEnum
CREATE TYPE "ArchiveStatus" AS ENUM ('NONE', 'QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('FETCH_URL_META', 'FETCH_GITHUB_META', 'ARCHIVE_GITHUB', 'REFRESH_GITHUB_META', 'CHECK_LINK', 'GENERATE_THUMBNAIL', 'CLEANUP_TRASH');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "UsageStatus" AS ENUM ('REVIEWING', 'ADOPTED', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "MaterialKind" AS ENUM ('PAPER', 'ARTICLE', 'VIDEO', 'MODEL', 'SERVICE', 'COURSE');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('KO', 'EN', 'ETC');

-- CreateEnum
CREATE TYPE "McpTransport" AS ENUM ('STDIO', 'SSE', 'HTTP');

-- CreateEnum
CREATE TYPE "NoteKind" AS ENUM ('CONVENTION', 'TROUBLESHOOT', 'TIP', 'RETRO');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SIGNUP_REQUEST', 'APPROVED', 'REJECTED', 'JOB_DONE', 'JOB_FAILED', 'SYSTEM');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT,
    "avatar_url" TEXT,
    "bio" TEXT,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "signup_reason" TEXT,
    "status_reason" TEXT,
    "status_changed_at" TIMESTAMP(3),
    "status_changed_by" TEXT,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "password_changed_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reserved_usernames" (
    "username" TEXT NOT NULL,
    "reserved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "reserved_usernames_pkey" PRIMARY KEY ("username")
);

-- CreateTable
CREATE TABLE "password_histories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "scopes" TEXT[],
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoked_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "parent_id" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "usage_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resources" (
    "id" TEXT NOT NULL,
    "type" "ResourceType" NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT,
    "url" TEXT,
    "url_normalized" TEXT,
    "thumbnail_url" TEXT,
    "status" "ResourceStatus" NOT NULL DEFAULT 'PUBLISHED',
    "source_channel" "SourceChannel" NOT NULL DEFAULT 'WEB',
    "category_id" TEXT,
    "author_id" TEXT NOT NULL,
    "metadata" JSONB,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "bookmark_count" INTEGER NOT NULL DEFAULT 0,
    "source_status" "SourceStatus",
    "source_checked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_materials" (
    "resource_id" TEXT NOT NULL,
    "material_kind" "MaterialKind" NOT NULL,
    "source_name" TEXT,
    "authors" TEXT[],
    "published_at" TIMESTAMP(3),
    "language" "Language",
    "reading_time" INTEGER,
    "key_points" TEXT,
    "applicability" TEXT,

    CONSTRAINT "ai_materials_pkey" PRIMARY KEY ("resource_id")
);

-- CreateTable
CREATE TABLE "github_repos" (
    "resource_id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "default_branch" TEXT,
    "stars" INTEGER,
    "forks" INTEGER,
    "primary_language" TEXT,
    "license" TEXT,
    "topics" TEXT[],
    "pushed_at" TIMESTAMP(3),
    "readme_content" TEXT,
    "readme_fetched_at" TIMESTAMP(3),
    "latest_release" TEXT,
    "archive_status" "ArchiveStatus" NOT NULL DEFAULT 'NONE',
    "archived_sha" TEXT,
    "archive_size_bytes" BIGINT,
    "is_gone" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "github_repos_pkey" PRIMARY KEY ("resource_id")
);

-- CreateTable
CREATE TABLE "mcp_servers" (
    "resource_id" TEXT NOT NULL,
    "package_name" TEXT,
    "transport" "McpTransport" NOT NULL,
    "install_command" TEXT,
    "config_json" TEXT NOT NULL,
    "env_vars" JSONB,
    "provided_tools" JSONB,
    "client_support" TEXT[],
    "usage_status" "UsageStatus" NOT NULL DEFAULT 'REVIEWING',
    "owner_user_id" TEXT,

    CONSTRAINT "mcp_servers_pkey" PRIMARY KEY ("resource_id")
);

-- CreateTable
CREATE TABLE "skills" (
    "resource_id" TEXT NOT NULL,
    "skill_name" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "trigger_condition" TEXT NOT NULL,
    "target_clients" TEXT[],
    "usage_example" TEXT NOT NULL,
    "usage_status" "UsageStatus" NOT NULL DEFAULT 'REVIEWING',
    "version" TEXT,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("resource_id")
);

-- CreateTable
CREATE TABLE "dev_notes" (
    "resource_id" TEXT NOT NULL,
    "note_kind" "NoteKind" NOT NULL,
    "related_project" TEXT,
    "occurred_at" TIMESTAMP(3),

    CONSTRAINT "dev_notes_pkey" PRIMARY KEY ("resource_id")
);

-- CreateTable
CREATE TABLE "prompts" (
    "resource_id" TEXT NOT NULL,
    "prompt_text" TEXT NOT NULL,
    "use_case" TEXT NOT NULL,
    "target_model" TEXT,
    "variables" JSONB,
    "usage_status" "UsageStatus" NOT NULL DEFAULT 'REVIEWING',

    CONSTRAINT "prompts_pkey" PRIMARY KEY ("resource_id")
);

-- CreateTable
CREATE TABLE "resource_tags" (
    "resource_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    CONSTRAINT "resource_tags_pkey" PRIMARY KEY ("resource_id","tag_id")
);

-- CreateTable
CREATE TABLE "resource_relations" (
    "id" TEXT NOT NULL,
    "from_resource_id" TEXT NOT NULL,
    "to_resource_id" TEXT NOT NULL,
    "relation_type" "RelationType" NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum_sha256" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_files" (
    "resource_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "role" "FileRole" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "resource_files_pkey" PRIMARY KEY ("resource_id","file_id","role")
);

-- CreateTable
CREATE TABLE "bookmarks" (
    "user_id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("user_id","resource_id")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "owner_id" TEXT NOT NULL,
    "visibility" "Visibility" NOT NULL DEFAULT 'PRIVATE',
    "cover_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_items" (
    "collection_id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,

    CONSTRAINT "collection_items_pkey" PRIMARY KEY ("collection_id","resource_id")
);

-- CreateTable
CREATE TABLE "resource_revisions" (
    "id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "editor_id" TEXT NOT NULL,
    "changed_fields" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "resource_id" TEXT,
    "payload" JSONB,
    "result" JSONB,
    "error_message" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "requested_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link_url" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_username" TEXT,
    "via" "ActorVia" NOT NULL DEFAULT 'WEB',
    "api_key_id" TEXT,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "summary" TEXT,
    "diff" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_type_settings" (
    "type" "ResourceType" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "show_in_nav" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "content_type_settings_pkey" PRIMARY KEY ("type")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "password_histories_user_id_created_at_idx" ON "password_histories"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_prefix_key" ON "api_keys"("key_prefix");

-- CreateIndex
CREATE INDEX "api_keys_user_id_idx" ON "api_keys"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_idx" ON "sessions"("expires");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tags_slug_key" ON "tags"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "resources_slug_key" ON "resources"("slug");

-- CreateIndex
CREATE INDEX "resources_type_created_at_idx" ON "resources"("type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "resources_category_id_idx" ON "resources"("category_id");

-- CreateIndex
CREATE INDEX "resources_author_id_idx" ON "resources"("author_id");

-- CreateIndex
CREATE INDEX "resources_status_idx" ON "resources"("status");

-- CreateIndex
CREATE INDEX "resources_source_channel_idx" ON "resources"("source_channel");

-- CreateIndex
CREATE UNIQUE INDEX "github_repos_owner_repo_key" ON "github_repos"("owner", "repo");

-- CreateIndex
CREATE UNIQUE INDEX "resource_relations_from_resource_id_to_resource_id_relation_key" ON "resource_relations"("from_resource_id", "to_resource_id", "relation_type");

-- CreateIndex
CREATE UNIQUE INDEX "files_storage_key_key" ON "files"("storage_key");

-- CreateIndex
CREATE INDEX "files_checksum_sha256_idx" ON "files"("checksum_sha256");

-- CreateIndex
CREATE UNIQUE INDEX "collections_slug_key" ON "collections"("slug");

-- CreateIndex
CREATE INDEX "resource_revisions_resource_id_created_at_idx" ON "resource_revisions"("resource_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "jobs_status_created_at_idx" ON "jobs"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- AddForeignKey
ALTER TABLE "password_histories" ADD CONSTRAINT "password_histories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_materials" ADD CONSTRAINT "ai_materials_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_repos" ADD CONSTRAINT "github_repos_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dev_notes" ADD CONSTRAINT "dev_notes_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_tags" ADD CONSTRAINT "resource_tags_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_tags" ADD CONSTRAINT "resource_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_relations" ADD CONSTRAINT "resource_relations_from_resource_id_fkey" FOREIGN KEY ("from_resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_relations" ADD CONSTRAINT "resource_relations_to_resource_id_fkey" FOREIGN KEY ("to_resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_files" ADD CONSTRAINT "resource_files_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_files" ADD CONSTRAINT "resource_files_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_revisions" ADD CONSTRAINT "resource_revisions_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_revisions" ADD CONSTRAINT "resource_revisions_editor_id_fkey" FOREIGN KEY ("editor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════════════════════
-- 아래는 Prisma 로 표현할 수 없어 직접 작성한 부분입니다 (DEV-02 · 2.5절).
-- 스키마를 바꿔 마이그레이션을 다시 만들 때 이 블록을 옮겨 붙이는 것을 잊지 마세요.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1) 전문 검색 컬럼 · 인덱스 (DEV-01 · 1.7절) ──────────────────
ALTER TABLE "resources" ADD COLUMN "search_vector" tsvector;

CREATE INDEX "idx_resources_search" ON "resources" USING GIN ("search_vector");
CREATE INDEX "idx_resources_title_trgm" ON "resources" USING GIN ("title" gin_trgm_ops);

-- ── 2) search_vector 갱신 트리거 ─────────────────────────────────
-- 'simple' 사전을 쓰는 이유: PostgreSQL 기본 설치에 한국어 형태소 사전이 없습니다.
-- simple + pg_trgm 조합으로 시작하고, 정확도가 부족하면 DEC-007 재검토 조건을 따릅니다.
CREATE OR REPLACE FUNCTION resources_search_update() RETURNS trigger AS $$
BEGIN
  NEW."search_vector" :=
      setweight(to_tsvector('simple', unaccent(coalesce(NEW."title", ''))),   'A')
   || setweight(to_tsvector('simple', unaccent(coalesce(NEW."summary", ''))), 'B')
   || setweight(to_tsvector('simple', unaccent(coalesce(NEW."body", ''))),    'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_resources_search
  BEFORE INSERT OR UPDATE OF "title", "summary", "body" ON "resources"
  FOR EACH ROW EXECUTE FUNCTION resources_search_update();

-- ── 3) 삭제되지 않은 자료만 URL 유니크 (FR-RES-011) ──────────────
-- 부분 인덱스라 Prisma 로 표현할 수 없습니다. 휴지통에 있는 자료와 같은 URL을
-- 다시 등록할 수 있어야 하므로 deleted_at IS NULL 조건이 필요합니다.
CREATE UNIQUE INDEX "idx_resources_url_unique"
  ON "resources" ("url_normalized")
  WHERE "deleted_at" IS NULL AND "url_normalized" IS NOT NULL;

-- ── 4) 자기 참조 관계 방지 ───────────────────────────────────────
ALTER TABLE "resource_relations"
  ADD CONSTRAINT "chk_relation_not_self"
  CHECK ("from_resource_id" <> "to_resource_id");

-- ── 5) 카테고리 깊이 2단계 제한 (REQ-04 · 4.5절) ─────────────────
CREATE OR REPLACE FUNCTION categories_depth_check() RETURNS trigger AS $$
BEGIN
  IF NEW."parent_id" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "categories" c
    WHERE c."id" = NEW."parent_id" AND c."parent_id" IS NOT NULL
  ) THEN
    RAISE EXCEPTION '카테고리는 2단계까지만 허용합니다';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_categories_depth
  BEFORE INSERT OR UPDATE ON "categories"
  FOR EACH ROW EXECUTE FUNCTION categories_depth_check();
