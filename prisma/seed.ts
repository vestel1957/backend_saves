import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const BASE_PERMISSIONS = [
  { module: 'configuracion', submodule: 'usuarios', action: 'ver' },
  { module: 'configuracion', submodule: 'usuarios', action: 'crear' },
  { module: 'configuracion', submodule: 'usuarios', action: 'editar' },
  { module: 'configuracion', submodule: 'usuarios', action: 'eliminar' },
  { module: 'configuracion', submodule: 'roles', action: 'ver' },
  { module: 'configuracion', submodule: 'roles', action: 'crear' },
  { module: 'configuracion', submodule: 'roles', action: 'editar' },
  { module: 'configuracion', submodule: 'roles', action: 'eliminar' },
  { module: 'sistema', submodule: 'auditoria', action: 'ver' },
  { module: 'sistema', submodule: 'tenants', action: 'ver' },
  { module: 'sistema', submodule: 'tenants', action: 'crear' },
  { module: 'sistema', submodule: 'tenants', action: 'editar' },
  { module: 'sistema', submodule: 'tenants', action: 'eliminar' },
];

async function main() {
  const prisma = new PrismaClient();

  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@vestel.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!@#';

    console.log('Seeding database...\n');

    // 1. Crear tenant principal
    const tenant = await prisma.tenants.upsert({
      where: { slug: 'principal' },
      update: {},
      create: {
        name: 'Principal',
        slug: 'principal',
        plan: 'enterprise',
        max_users: 999,
        contact_email: adminEmail,
      },
    });
    console.log(`Tenant: ${tenant.name} (${tenant.id})`);

    // 2. Crear permisos base
    for (const p of BASE_PERMISSIONS) {
      await prisma.permissions.upsert({
        where: {
          tenant_id_module_submodule_action: {
            tenant_id: tenant.id,
            module: p.module,
            submodule: p.submodule,
            action: p.action,
          },
        },
        update: {},
        create: {
          tenant_id: tenant.id,
          module: p.module,
          submodule: p.submodule,
          action: p.action,
          description: `${p.module}.${p.submodule}.${p.action}`,
        },
      });
    }
    console.log(`Permisos: ${BASE_PERMISSIONS.length} creados/verificados`);

    // 3. Crear rol Administrador
    let adminRole = await prisma.roles.findFirst({
      where: { tenant_id: tenant.id, name: 'Administrador' },
    });

    if (!adminRole) {
      adminRole = await prisma.roles.create({
        data: {
          tenant_id: tenant.id,
          name: 'Administrador',
          description: 'Rol con acceso total al sistema',
          is_system: true,
        },
      });
    }
    console.log(`Rol: ${adminRole.name} (${adminRole.id})`);

    // 4. Asignar todos los permisos al rol
    const allPermissions = await prisma.permissions.findMany({
      where: { tenant_id: tenant.id },
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

    // 5. Crear usuario super admin
    const passwordHash = await bcrypt.hash(adminPassword, 12);

    let adminUser = await prisma.users.findUnique({
      where: { email: adminEmail },
    });

    if (!adminUser) {
      adminUser = await prisma.users.create({
        data: {
          tenant_id: tenant.id,
          email: adminEmail,
          username: 'admin',
          password_hash: passwordHash,
          first_name: 'Super',
          last_name: 'Admin',
          is_super_admin: true,
          is_active: true,
        },
      });

      // 6. Asignar rol al usuario
      await prisma.user_roles.create({
        data: {
          user_id: adminUser.id,
          role_id: adminRole.id,
          assigned_by: adminUser.id,
        },
      });
    }

    console.log(`\nSeed completado exitosamente!`);
    console.log(`\n  Email:    ${adminEmail}`);
    console.log(`  Password: ${adminPassword}`);
    console.log(`  Tenant:   ${tenant.name} (${tenant.slug})\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('Error en seed:', e);
  process.exit(1);
});
