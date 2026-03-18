-- AlterTable: Add soft delete support for users
ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "idx_users_deleted" ON "users"("deleted_at");
