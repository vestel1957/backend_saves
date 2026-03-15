import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const BASE_PERMISSIONS = [
  // Configuracion
  { module: 'configuracion', submodule: 'usuarios', action: 'ver' },
  { module: 'configuracion', submodule: 'usuarios', action: 'crear' },
  { module: 'configuracion', submodule: 'usuarios', action: 'editar' },
  { module: 'configuracion', submodule: 'usuarios', action: 'eliminar' },
  { module: 'configuracion', submodule: 'roles', action: 'ver' },
  { module: 'configuracion', submodule: 'roles', action: 'crear' },
  { module: 'configuracion', submodule: 'roles', action: 'editar' },
  { module: 'configuracion', submodule: 'roles', action: 'eliminar' },
  // Sistema
  { module: 'sistema', submodule: 'auditoria', action: 'ver' },
  { module: 'sistema', submodule: 'configuracion', action: 'ver' },
  { module: 'sistema', submodule: 'configuracion', action: 'editar' },
  { module: 'sistema', submodule: 'notificaciones', action: 'crear' },
];

const DEFAULT_SETTINGS = [
  { key: 'company_name', value: process.env.COMPANY_NAME || 'Mi Empresa', group: 'general', type: 'string' },
  { key: 'company_logo', value: '', group: 'general', type: 'string' },
  { key: 'timezone', value: 'America/Bogota', group: 'general', type: 'string' },
  { key: 'currency', value: 'COP', group: 'general', type: 'string' },
  { key: 'date_format', value: 'DD/MM/YYYY', group: 'general', type: 'string' },
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

    // 1. Crear permisos base
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
    console.log(`Permisos: ${BASE_PERMISSIONS.length} creados/verificados`);

    // 2. Crear rol Administrador
    let adminRole = await prisma.roles.findFirst({
      where: { name: 'Administrador' },
    });

    if (!adminRole) {
      adminRole = await prisma.roles.create({
        data: {
          name: 'Administrador',
          description: 'Rol con acceso total al sistema',
          is_system: true,
        },
      });
    }
    console.log(`Rol: ${adminRole.name} (${adminRole.id})`);

    // 3. Asignar todos los permisos al rol
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
    console.log(`Permisos asignados al rol: ${allPermissions.length}`);

    // 4. Crear usuario super admin
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

    // 5. Crear settings por defecto
    for (const s of DEFAULT_SETTINGS) {
      await prisma.settings.upsert({
        where: { key: s.key },
        update: {},
        create: s,
      });
    }
    console.log(`Settings: ${DEFAULT_SETTINGS.length} creados/verificados`);

    console.log(`\nSeed completado exitosamente!`);
    console.log(`\n  Email:    ${adminEmail}`);
    console.log(`  Password: ${adminPassword}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('Error en seed:', e);
  process.exit(1);
});
