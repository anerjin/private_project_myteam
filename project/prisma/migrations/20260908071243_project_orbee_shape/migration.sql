/*
  Warnings:

  - You are about to drop the column `search_vector` on the `resources` table. All the data in the column will be lost.
  - You are about to drop the `project_doc_versions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `project_docs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `project_task_comments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `project_task_links` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `project_tasks` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "project_doc_versions" DROP CONSTRAINT "project_doc_versions_doc_id_fkey";

-- DropForeignKey
ALTER TABLE "project_docs" DROP CONSTRAINT "project_docs_author_id_fkey";

-- DropForeignKey
ALTER TABLE "project_docs" DROP CONSTRAINT "project_docs_project_id_fkey";

-- DropForeignKey
ALTER TABLE "project_task_comments" DROP CONSTRAINT "project_task_comments_author_id_fkey";

-- DropForeignKey
ALTER TABLE "project_task_comments" DROP CONSTRAINT "project_task_comments_task_id_fkey";

-- DropForeignKey
ALTER TABLE "project_task_links" DROP CONSTRAINT "project_task_links_from_task_id_fkey";

-- DropForeignKey
ALTER TABLE "project_task_links" DROP CONSTRAINT "project_task_links_to_task_id_fkey";

-- DropForeignKey
ALTER TABLE "project_tasks" DROP CONSTRAINT "project_tasks_assignee_id_fkey";

-- DropForeignKey
ALTER TABLE "project_tasks" DROP CONSTRAINT "project_tasks_parent_id_fkey";

-- DropForeignKey
ALTER TABLE "project_tasks" DROP CONSTRAINT "project_tasks_project_id_fkey";

-- ═══════════════════════════════════════════════════════════════════
-- ⚠️  아래 세 줄은 **주석 처리했습니다.**
--
-- `search_vector` 와 그 두 인덱스는 `init` 이 raw SQL 로만 만든 것이라
-- `schema.prisma` 에 없고, 그래서 `migrate dev` 는 **매번** 이것을 드리프트로
-- 보고 지우려 듭니다. `init` 머리말이 「이 블록을 옮겨 붙이는 것을 잊지
-- 마세요」라고 적은 것이 이 함정이고, `20260904110000_projects` 도 같은 줄을
-- 주석 처리해 넘겼습니다.
--
-- 2026-09-08 에 한 번 **놓쳤습니다**(`20260908051503`). 트리거는 남고 컬럼만
-- 사라져 `resources` 로의 모든 INSERT 가 `42703` 으로 죽었고 — 자료 등록이
-- 통째로 멎었는데 오류는 컬럼 이름조차 안 알려 줍니다(`(not available)`).
-- 복구는 `20260908060000_restore_resources_search_vector` 입니다.
-- ═══════════════════════════════════════════════════════════════════
-- DropIndex
-- DROP INDEX "idx_resources_search";

-- DropIndex
-- DROP INDEX "idx_resources_title_trgm";

-- AlterTable
-- ALTER TABLE "resources" DROP COLUMN "search_vector";

-- DropTable
DROP TABLE "project_doc_versions";

-- DropTable
DROP TABLE "project_docs";

-- DropTable
DROP TABLE "project_task_comments";

-- DropTable
DROP TABLE "project_task_links";

-- DropTable
DROP TABLE "project_tasks";

-- DropEnum
DROP TYPE "ProjectSection";

-- DropEnum
DROP TYPE "TaskLinkType";

-- DropEnum
DROP TYPE "TaskStatus";

-- CreateTable
CREATE TABLE "project_items" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "starts_on" DATE,
    "ends_on" DATE,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "assignee_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_item_comments" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "project_item_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_items_project_id_sort_order_idx" ON "project_items"("project_id", "sort_order");

-- CreateIndex
CREATE INDEX "project_items_assignee_id_idx" ON "project_items"("assignee_id");

-- CreateIndex
CREATE INDEX "project_item_comments_item_id_deleted_at_created_at_idx" ON "project_item_comments"("item_id", "deleted_at", "created_at");

-- AddForeignKey
ALTER TABLE "project_items" ADD CONSTRAINT "project_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_items" ADD CONSTRAINT "project_items_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_item_comments" ADD CONSTRAINT "project_item_comments_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "project_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_item_comments" ADD CONSTRAINT "project_item_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
