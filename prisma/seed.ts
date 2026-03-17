import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const BASE_PERMISSIONS = [
  // Configuration > Users
  { module: 'configuracion', submodule: 'usuarios', action: 'ver' },
  { module: 'configuracion', submodule: 'usuarios', action: 'crear' },
  { module: 'configuracion', submodule: 'usuarios', action: 'editar' },
  { module: 'configuracion', submodule: 'usuarios', action: 'eliminar' },
  // Configuration > Roles
  { module: 'configuracion', submodule: 'roles', action: 'ver' },
  { module: 'configuracion', submodule: 'roles', action: 'crear' },
  { module: 'configuracion', submodule: 'roles', action: 'editar' },
  { module: 'configuracion', submodule: 'roles', action: 'eliminar' },
  // System > Audit
  { module: 'sistema', submodule: 'auditoria', action: 'ver' },
  // System > Settings
  { module: 'sistema', submodule: 'configuracion', action: 'ver' },
  { module: 'sistema', submodule: 'configuracion', action: 'editar' },
  // System > Notifications
  { module: 'sistema', submodule: 'notificaciones', action: 'ver' },
  { module: 'sistema', submodule: 'notificaciones', action: 'crear' },
  // System > Dashboard
  { module: 'sistema', submodule: 'dashboard', action: 'ver' },
  // System > Sessions
  { module: 'sistema', submodule: 'sesiones', action: 'ver' },
  { module: 'sistema', submodule: 'sesiones', action: 'eliminar' },
];

const DEFAULT_SETTINGS = [
  { key: 'company_name', value: process.env.COMPANY_NAME || 'Admin Panel', group: 'general', type: 'string' },
  { key: 'company_logo', value: '', group: 'general', type: 'string' },
  { key: 'timezone', value: 'UTC', group: 'general', type: 'string' },
  { key: 'currency', value: 'USD', group: 'general', type: 'string' },
  { key: 'date_format', value: 'YYYY-MM-DD', group: 'general', type: 'string' },
  { key: 'session_timeout_minutes', value: '30', group: 'security', type: 'number' },
  { key: 'require_2fa', value: 'false', group: 'security', type: 'boolean' },
  { key: 'max_login_attempts', value: '5', group: 'security', type: 'number' },
  { key: 'primary_color', value: '#1a1a2e', group: 'appearance', type: 'string' },
  { key: 'accent_color', value: '#e94560', group: 'appearance', type: 'string' },
];

async function main() {
  const prisma = new PrismaClient();

  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@app.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!@#';

    console.log('Seeding database...\n');

    // 1. Create base permissions
    for (const p of BASE_PERMISSIONS) {
      await prisma.permissions.upsert({
        where: {
          module_submodule_action: {
            module: p.module,
            submodule: p.submodule,
            action: p.action,
          },
        },
        update: {},
        create: {
          module: p.module,
          submodule: p.submodule,
          action: p.action,
          description: `${p.module}.${p.submodule}.${p.action}`,
        },
      });
    }
    console.log(`Permissions: ${BASE_PERMISSIONS.length} created/verified`);

    // 2. Create Administrator role
    let adminRole = await prisma.roles.findFirst({
      where: { name: 'Administrator' },
    });

    if (!adminRole) {
      adminRole = await prisma.roles.create({
        data: {
          name: 'Administrator',
          description: 'Full system access role',
          is_system: true,
        },
      });
    }
    console.log(`Role: ${adminRole.name} (${adminRole.id})`);

    // 3. Assign all permissions to role
    const allPermissions = await prisma.permissions.findMany({
      select: { id: true },
    });

    await prisma.role_permissions.createMany({
      data: allPermissions.map((p) => ({
        role_id: adminRole!.id,
        permission_id: p.id,
      })),
      skipDuplicates: true,
    });
    console.log(`Permissions assigned to role: ${allPermissions.length}`);

    // 4. Create super admin user
    const passwordHash = await bcrypt.hash(adminPassword, 12);

    let adminUser = await prisma.users.findUnique({
      where: { email: adminEmail },
    });

    if (!adminUser) {
      adminUser = await prisma.users.create({
        data: {
          email: adminEmail,
          username: 'admin',
          password_hash: passwordHash,
          first_name: 'Super',
          last_name: 'Admin',
          is_super_admin: true,
          is_active: true,
        },
      });

      await prisma.user_roles.create({
        data: {
          user_id: adminUser.id,
          role_id: adminRole.id,
          assigned_by: adminUser.id,
        },
      });
    }

    // 5. Create default settings
    for (const s of DEFAULT_SETTINGS) {
      await prisma.settings.upsert({
        where: { key: s.key },
        update: {},
        create: s,
      });
    }
    console.log(`Settings: ${DEFAULT_SETTINGS.length} created/verified`);

    console.log(`\nSeed completed successfully!`);
    console.log(`\n  Email:    ${adminEmail}`);
    console.log(`  Password: ${adminPassword}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('Seed error:', e);
  process.exit(1);
});
