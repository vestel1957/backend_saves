-- AlterTable: Add soft delete support for users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_users_deleted" ON "users"("deleted_at");
