-- 가입 신청·승인 절차 제거 (DEC-077)
--
-- Postgres 는 enum 값을 «지울» 수 없습니다 (`ALTER TYPE … ADD VALUE` 는 있어도
-- `DROP VALUE` 는 없습니다). 그래서 타입을 새로 만들고 갈아 끼웁니다.
-- 기본값이 걸린 컬럼은 **먼저 기본값을 떼야** 타입을 바꿀 수 있습니다.
--
-- 손으로 씁니다. `prisma migrate dev` 로 만들면 `resources.search_vector` 를
-- 지우려 듭니다 — 그 컬럼은 마이그레이션 SQL 로만 존재하고 스키마에는 없어서
-- 매번 드리프트로 잡힙니다 (20260908060000_restore_resources_search_vector).

-- ── users.status ────────────────────────────────────
-- 적용 시점의 실측: PENDING·REJECTED 행 0건. 남아 있으면 USING 캐스팅이 실패해
-- 트랜잭션이 통째로 되돌아갑니다 — 조용히 ACTIVE 로 바꾸지 않습니다.
ALTER TABLE "users" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "UserStatus" RENAME TO "UserStatus_old";
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'WITHDRAWN');
ALTER TABLE "users"
  ALTER COLUMN "status" TYPE "UserStatus" USING ("status"::text::"UserStatus");
ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
DROP TYPE "UserStatus_old";

-- 신청서의 칸이었습니다. 신청이 없으면 채울 사람이 없습니다.
ALTER TABLE "users" DROP COLUMN "signup_reason";

-- ── notifications.type ──────────────────────────────
-- `SIGNUP_REQUEST` 알림은 「새 가입 신청」이라 말하고 /admin/members 로 보냅니다.
-- 그 화면에 이제 승인 대기 탭이 없으므로 **아무 데도 데려가지 못하는 알림**입니다.
-- 지웁니다 — 무슨 일이 있었는지는 audit_logs 의 USER_SIGNUP 이 그대로 들고 있습니다.
DELETE FROM "notifications"
  WHERE "type" IN ('SIGNUP_REQUEST', 'APPROVED', 'REJECTED');

ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
CREATE TYPE "NotificationType" AS ENUM ('JOB_DONE', 'JOB_FAILED', 'SYSTEM');
ALTER TABLE "notifications"
  ALTER COLUMN "type" TYPE "NotificationType" USING ("type"::text::"NotificationType");
DROP TYPE "NotificationType_old";
