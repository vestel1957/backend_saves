import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

// Permisos base que todo tenant necesita
const BASE_PERMISSIONS = [
  // Usuarios
  { module: 'configuracion', submodule: 'usuarios', action: 'ver' },
  { module: 'configuracion', submodule: 'usuarios', action: 'crear' },
  { module: 'configuracion', submodule: 'usuarios', action: 'editar' },
  { module: 'configuracion', submodule: 'usuarios', action: 'eliminar' },
  // Roles
  { module: 'configuracion', submodule: 'roles', action: 'ver' },
  { module: 'configuracion', submodule: 'roles', action: 'crear' },
  { module: 'configuracion', submodule: 'roles', action: 'editar' },
  { module: 'configuracion', submodule: 'roles', action: 'eliminar' },
  // Auditoría
  { module: 'sistema', submodule: 'auditoria', action: 'ver' },
  // Tenants (solo super admins usarán estos)
  { module: 'sistema', submodule: 'tenants', action: 'ver' },
  { module: 'sistema', submodule: 'tenants', action: 'crear' },
  { module: 'sistema', submodule: 'tenants', action: 'editar' },
  { module: 'sistema', submodule: 'tenants', action: 'eliminar' },
];

export { BASE_PERMISSIONS };

@Injectable()
export class TenantOnboardingService {
  private readonly logger = new Logger(TenantOnboardingService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  async onboard(tenantId: string, adminEmail: string) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const special = '!@#$%&*';
    let plainPassword = '';
    for (let i = 0; i < 10; i++) {
      plainPassword += chars.charAt(crypto.randomInt(chars.length));
    }
    plainPassword += special.charAt(crypto.randomInt(special.length));
    plainPassword += crypto.randomInt(10).toString();

    const passwordHash = await bcrypt.hash(plainPassword, 12);
    const username = adminEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').slice(0, 45);

    await this.prisma.$transaction(async (tx) => {
      // 1. Crear permisos base
      await tx.permissions.createMany({
        data: BASE_PERMISSIONS.map((p) => ({
          tenant_id: tenantId,
          module: p.module,
          submodule: p.submodule,
          action: p.action,
          description: `${p.module}.${p.submodule}.${p.action}`,
        })),
        skipDuplicates: true,
      });

      // 2. Obtener IDs de los permisos recién creados
      const permissions = await tx.permissions.findMany({
        where: { tenant_id: tenantId },
        select: { id: true },
      });

      // 3. Crear rol Administrador
      const adminRole = await tx.roles.create({
        data: {
          tenant_id: tenantId,
          name: 'Administrador',
          description: 'Rol con acceso total al sistema',
          is_system: true,
        },
      });

      // 4. Asignar todos los permisos al rol
      await tx.role_permissions.createMany({
        data: permissions.map((p) => ({
          role_id: adminRole.id,
          permission_id: p.id,
        })),
        skipDuplicates: true,
      });

      // 5. Crear usuario super admin
      const adminUser = await tx.users.create({
        data: {
          tenant_id: tenantId,
          email: adminEmail,
          username,
          password_hash: passwordHash,
          is_super_admin: true,
          is_active: true,
        },
      });

      // 6. Asignar rol al usuario
      await tx.user_roles.create({
        data: {
          user_id: adminUser.id,
          role_id: adminRole.id,
          assigned_by: adminUser.id,
        },
      });

      this.logger.log(`Onboarding completado para tenant ${tenantId}, admin: ${adminEmail}`);
    });

    // Enviar credenciales por email (no bloquea)
    this.emailService
      .sendWelcomeCredentials(adminEmail, plainPassword)
      .catch((err) => this.logger.error('Error enviando credenciales de onboarding', err));

    return { admin_email: adminEmail };
  }
}
