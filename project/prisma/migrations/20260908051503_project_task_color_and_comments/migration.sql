/*
  Warnings:

  - You are about to drop the column `search_vector` on the `resources` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "idx_resources_search";

-- DropIndex
DROP INDEX "idx_resources_title_trgm";

-- AlterTable
ALTER TABLE "github_repos" ALTER COLUMN "file_tree" SET DATA TYPE JSONB;

-- AlterTable
ALTER TABLE "project_tasks" ADD COLUMN     "color" TEXT;

-- AlterTable
ALTER TABLE "resources" DROP COLUMN "search_vector";

-- CreateTable
CREATE TABLE "project_task_comments" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "project_task_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_task_comments_task_id_deleted_at_created_at_idx" ON "project_task_comments"("task_id", "deleted_at", "created_at");

-- AddForeignKey
ALTER TABLE "project_task_comments" ADD CONSTRAINT "project_task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "project_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_task_comments" ADD CONSTRAINT "project_task_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
