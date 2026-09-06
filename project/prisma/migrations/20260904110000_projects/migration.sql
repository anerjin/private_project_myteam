-- 프로젝트 (`FR-PROJ-*` · `DEC-069` · 로드맵 `M7`/`P10`)
--
-- ## 이 파일은 «손으로» 골라 담았습니다
--
-- `prisma migrate diff` 가 뱉은 것을 그대로 쓰면 안 됩니다. 실제로 뽑아 보니
-- 제 변경과 **아무 상관 없는 파괴적 구문 넷**이 섞여 있었습니다:
--
--     DROP INDEX "idx_resources_search";
--     DROP INDEX "idx_resources_title_trgm";
--     ALTER TABLE "resources" DROP COLUMN "search_vector";
--     ALTER TABLE "github_repos" ALTER COLUMN "file_tree" SET DATA TYPE JSONB;
--
-- 전부 **Prisma 로 표현할 수 없어 손으로 적용한 것**들입니다 (`DEV-02 · 2.5`).
-- 스키마 파일이 그 존재를 모르므로 diff 는 「없어야 할 것」으로 봅니다.
-- 그대로 적용하면 **전문 검색이 통째로 죽습니다** (`FR-SRCH-*`).
--
-- 그래서 이 표들을 만들 때는 **언제나 프로젝트 구문만 골라 담습니다.**
-- `migrate dev` 로 자동 생성하지 마십시오.
--
-- ## 왜 `resources` 가 아닌가
--
-- 자료는 «바깥 어떤 것에 대한 문서»이고 프로젝트 문서는 «우리가 쓰는 글»입니다.
-- 분류·태그·중복 검사·수집 채널·아카이브가 하나도 안 맞습니다 (`DEC-069`).
--
-- ## 날짜가 `DATE` 인 이유
--
-- 일정은 하루 단위입니다. `TIMESTAMP` 로 두면 「9월 3일」이 브라우저 시간대에
-- 따라 2일·4일로 보이고 **간트 막대가 하루씩 밀립니다.**
--
-- ## 여기에 «없는» 것
--
-- | 없는 것 | 왜 |
-- | --- | --- |
-- | `visibility` | 승인된 회원 **전원 열람** (`DEC-018`). 미리 두면 조회마다 조건이 붙고, 정작 필요한 날 아무도 값을 안 채워 뒀다는 것을 알게 됩니다 |
-- | 부모의 기간·진행률 | 자식에서 굴러 올라온 값이라 저장하면 곧 어긋납니다. **읽을 때 계산합니다** |
-- | 순환 방지 제약 | 「A→B→A」는 외래키로 못 막습니다. service 가 검사합니다 |

CREATE TYPE "ProjectStatus" AS ENUM ('PLANNED', 'ACTIVE', 'PAUSED', 'DONE');
CREATE TYPE "ProjectSection" AS ENUM ('PLAN', 'DESIGN', 'DEV');
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'DOING', 'DONE', 'HOLD');
CREATE TYPE "TaskLinkType" AS ENUM ('FINISH_TO_START');

CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNED',
    "starts_on" DATE,
    "ends_on" DATE,
    "owner_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_docs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "section" "ProjectSection" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "author_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "project_docs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_doc_versions" (
    "id" TEXT NOT NULL,
    "doc_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "edited_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_doc_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_tasks" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "title" TEXT NOT NULL,
    "starts_on" DATE,
    "ends_on" DATE,
    "is_milestone" BOOLEAN NOT NULL DEFAULT false,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "assignee_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_task_links" (
    "id" TEXT NOT NULL,
    "from_task_id" TEXT NOT NULL,
    "to_task_id" TEXT NOT NULL,
    "type" "TaskLinkType" NOT NULL DEFAULT 'FINISH_TO_START',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_task_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");
CREATE INDEX "projects_deleted_at_updated_at_idx" ON "projects"("deleted_at", "updated_at" DESC);
CREATE INDEX "project_docs_project_id_section_sort_order_idx" ON "project_docs"("project_id", "section", "sort_order");
CREATE INDEX "project_doc_versions_doc_id_created_at_idx" ON "project_doc_versions"("doc_id", "created_at" DESC);
CREATE INDEX "project_tasks_project_id_sort_order_idx" ON "project_tasks"("project_id", "sort_order");
CREATE INDEX "project_tasks_assignee_id_idx" ON "project_tasks"("assignee_id");
CREATE INDEX "project_task_links_to_task_id_idx" ON "project_task_links"("to_task_id");
CREATE UNIQUE INDEX "project_task_links_from_task_id_to_task_id_key" ON "project_task_links"("from_task_id", "to_task_id");

ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "project_docs" ADD CONSTRAINT "project_docs_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_docs" ADD CONSTRAINT "project_docs_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "project_doc_versions" ADD CONSTRAINT "project_doc_versions_doc_id_fkey"
  FOREIGN KEY ("doc_id") REFERENCES "project_docs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_parent_id_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "project_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 담당자가 탈퇴하면 **할 일은 남고 담당만 비웁니다** — 일정이 사라지면 안 됩니다
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_assignee_id_fkey"
  FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "project_task_links" ADD CONSTRAINT "project_task_links_from_task_id_fkey"
  FOREIGN KEY ("from_task_id") REFERENCES "project_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_task_links" ADD CONSTRAINT "project_task_links_to_task_id_fkey"
  FOREIGN KEY ("to_task_id") REFERENCES "project_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
