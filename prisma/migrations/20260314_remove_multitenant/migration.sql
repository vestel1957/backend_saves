-- Remove multi-tenant: Drop tenant references and simplify schema

-- Drop foreign keys first
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_tenant_id_fkey";
ALTER TABLE "roles" DROP CONSTRAINT IF EXISTS "roles_tenant_id_fkey";
ALTER TABLE "permissions" DROP CONSTRAINT IF EXISTS "permissions_tenant_id_fkey";
ALTER TABLE "audit_log" DROP CONSTRAINT IF EXISTS "audit_log_tenant_id_fkey";
ALTER TABLE "login_attempts" DROP CONSTRAINT IF EXISTS "login_attempts_tenant_id_fkey";
ALTER TABLE "user_sessions" DROP CONSTRAINT IF EXISTS "user_sessions_tenant_id_fkey";
ALTER TABLE "areas" DROP CONSTRAINT IF EXISTS "areas_tenant_id_fkey";
ALTER TABLE "sedes" DROP CONSTRAINT IF EXISTS "sedes_tenant_id_fkey";

-- Drop tenant-scoped indexes
DROP INDEX IF EXISTS "idx_audit_tenant";
DROP INDEX IF EXISTS "idx_audit_module";
DROP INDEX IF EXISTS "idx_login_tenant";
DROP INDEX IF EXISTS "idx_permissions_tenant";
DROP INDEX IF EXISTS "idx_permissions_module";
DROP INDEX IF EXISTS "idx_permissions_submodule";
DROP INDEX IF EXISTS "idx_roles_tenant";
DROP INDEX IF EXISTS "idx_roles_active";
DROP INDEX IF EXISTS "idx_users_tenant";
DROP INDEX IF EXISTS "idx_users_active";
DROP INDEX IF EXISTS "idx_sessions_tenant";
DROP INDEX IF EXISTS "idx_areas_tenant";
DROP INDEX IF EXISTS "idx_sedes_tenant";
DROP INDEX IF EXISTS "idx_tenants_active";
DROP INDEX IF EXISTS "idx_tenants_plan";
DROP INDEX IF EXISTS "idx_tenants_slug";

-- Drop tenant-scoped unique constraints
ALTER TABLE "permissions" DROP CONSTRAINT IF EXISTS "permissions_tenant_id_module_submodule_action_key";
ALTER TABLE "roles" DROP CONSTRAINT IF EXISTS "roles_tenant_id_name_key";
ALTER TABLE "areas" DROP CONSTRAINT IF EXISTS "areas_tenant_id_name_key";
ALTER TABLE "sedes" DROP CONSTRAINT IF EXISTS "sedes_tenant_id_name_key";

-- Drop tenant_id columns
ALTER TABLE "users" DROP COLUMN IF EXISTS "tenant_id";
ALTER TABLE "roles" DROP COLUMN IF EXISTS "tenant_id";
ALTER TABLE "permissions" DROP COLUMN IF EXISTS "tenant_id";
ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "tenant_id";
ALTER TABLE "login_attempts" DROP COLUMN IF EXISTS "tenant_id";
ALTER TABLE "user_sessions" DROP COLUMN IF EXISTS "tenant_id";
ALTER TABLE "areas" DROP COLUMN IF EXISTS "tenant_id";
ALTER TABLE "sedes" DROP COLUMN IF EXISTS "tenant_id";

-- Add soft delete field if not exists
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(6);

-- Drop tenants table
DROP TABLE IF EXISTS "tenants" CASCADE;

-- Recreate unique constraints without tenant_id
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_module_submodule_action_key" UNIQUE ("module", "submodule", "action");
ALTER TABLE "roles" ADD CONSTRAINT "roles_name_key" UNIQUE ("name");
ALTER TABLE "areas" ADD CONSTRAINT "areas_name_key" UNIQUE ("name");
ALTER TABLE "sedes" ADD CONSTRAINT "sedes_name_key" UNIQUE ("name");

-- Recreate indexes without tenant_id
CREATE INDEX "idx_audit_module" ON "audit_log"("module", "submodule");
CREATE INDEX "idx_permissions_module" ON "permissions"("module");
CREATE INDEX "idx_permissions_submodule" ON "permissions"("module", "submodule");
CREATE INDEX "idx_roles_active" ON "roles"("is_active");
CREATE INDEX "idx_users_active" ON "users"("is_active");
CREATE INDEX IF NOT EXISTS "idx_users_deleted" ON "users"("deleted_at");
