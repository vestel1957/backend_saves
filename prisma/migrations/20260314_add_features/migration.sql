-- Add 2FA fields to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_2fa_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_secret" TEXT;

-- Create settings table
CREATE TABLE IF NOT EXISTS "settings" (
    "key" VARCHAR(100) NOT NULL,
    "value" TEXT NOT NULL,
    "group" VARCHAR(50) NOT NULL DEFAULT 'general',
    "type" VARCHAR(20) NOT NULL DEFAULT 'string',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "idx_settings_group" ON "settings"("group");

-- Create notifications table
CREATE TABLE IF NOT EXISTS "notifications" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "type" VARCHAR(20) NOT NULL DEFAULT 'info',
    "link" TEXT,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "idx_notifications_user_read" ON "notifications"("user_id", "read_at");
CREATE INDEX IF NOT EXISTS "idx_notifications_user_created" ON "notifications"("user_id", "created_at" DESC);

-- Add new permissions for settings and notifications
INSERT INTO "permissions" ("id", "module", "submodule", "action", "description")
VALUES
  (uuid_generate_v4(), 'sistema', 'configuracion', 'ver', 'sistema.configuracion.ver'),
  (uuid_generate_v4(), 'sistema', 'configuracion', 'editar', 'sistema.configuracion.editar'),
  (uuid_generate_v4(), 'sistema', 'notificaciones', 'crear', 'sistema.notificaciones.crear')
ON CONFLICT ("module", "submodule", "action") DO NOTHING;
