import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  private generateTemporaryPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const special = '!@#$%&*';
    let password = '';
    for (let i = 0; i < 10; i++) {
      password += chars.charAt(crypto.randomInt(chars.length));
    }
    password += special.charAt(crypto.randomInt(special.length));
    password += crypto.randomInt(10).toString();
    return password;
  }

  // ─── LISTAR USUARIOS ──────────────────────────────────
  async findAll(tenant_id: string, query: {
    page?: number;
    limit?: number;
    search?: string;
    is_active?: boolean;
  }) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = { tenant_id };

    if (query.is_active !== undefined) {
      where.is_active = query.is_active;
    }

    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { username: { contains: query.search, mode: 'insensitive' } },
        { first_name: { contains: query.search, mode: 'insensitive' } },
        { last_name: { contains: query.search, mode: 'insensitive' } },
        { document_number: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.users.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          email: true,
          username: true,
          first_name: true,
          last_name: true,
          avatar_url: true,
          document_number: true,
          phone: true,
          is_active: true,
          is_verified: true,
          last_login_at: true,
          created_at: true,
          area: { select: { id: true, name: true } },
          // ✅ sede va a través de user_sedes
          user_sedes: {
            select: {
              sede: { select: { id: true, name: true } },
              area: { select: { id: true, name: true } },
            },
          },
          user_roles: {
            select: {
              role: { select: { id: true, name: true } },
              assigned_at: true,
              expires_at: true,
            },
          },
        },
      }),
      this.prisma.users.count({ where }),
    ]);

    const formatted = users.map((user) => ({
      ...user,
      roles: user.user_roles.map((ur) => ur.role),
      sedes: user.user_sedes.map((us) => us.sede),
      user_roles: undefined,
      user_sedes: undefined,
    }));

    return {
      data: formatted,
      meta: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  // ─── OBTENER UN USUARIO ────────────────────────────────
  async findOne(id: string, tenant_id: string) {
    const user = await this.prisma.users.findFirst({
      where: { id, tenant_id },
      select: {
        id: true,
        email: true,
        username: true,
        first_name: true,
        last_name: true,
        avatar_url: true,
        document_number: true,
        document_type: true,
        hire_date: true,
        blood_type: true,
        eps: true,
        pension_fund: true,
        address: true,
        city: true,
        department: true,
        country: true,
        phone: true,
        area_id: true,
        signature_url: true,
        is_active: true,
        is_verified: true,
        is_super_admin: true,
        last_login_at: true,
        created_at: true,
        updated_at: true,
        area: { select: { id: true, name: true } },
        // ✅ sede va a través de user_sedes
        user_sedes: {
          select: {
            sede_id: true,
            area_id: true,
            assigned_at: true,
            sede: { select: { id: true, name: true } },
            area: { select: { id: true, name: true } },
          },
        },
        user_roles: {
          select: {
            assigned_at: true,
            expires_at: true,
            role: {
              select: { id: true, name: true, description: true },
            },
          },
        },
        user_permissions: {
          select: {
            permission: {
              select: { id: true, module: true, submodule: true, action: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return {
      ...user,
      roles: user.user_roles.map((ur) => ur.role),
      sedes: user.user_sedes.map((us) => us.sede),
      extra_permissions: user.user_permissions.map((up) => ({
        id: up.permission.id,
        module: up.permission.module,
        submodule: up.permission.submodule,
        action: up.permission.action,
        full: `${up.permission.module}.${up.permission.submodule}.${up.permission.action}`,
      })),
      user_roles: undefined,
      user_sedes: undefined,
      user_permissions: undefined,
    };
  }

  // ─── CREAR USUARIO ─────────────────────────────────────
  async create(tenant_id: string, data: {
    email: string;
    username: string;
    password?: string;
    first_name?: string;
    last_name?: string;
    document_number?: string;
    document_type?: string;
    hire_date?: string;
    blood_type?: string;
    eps?: string;
    pension_fund?: string;
    address?: string;
    city?: string;
    department?: string;
    country?: string;
    phone?: string;
    phone_alt?: string;
    area_id?: string;
    sede_ids?: string[];  // ✅ Se usa para crear user_sedes, no en users directamente
    role_id?: string;
    avatar_url?: string;
    signature_url?: string;
    document_urls?: string[];
  }, assigned_by: string) {
    const existing = await this.prisma.users.findFirst({
      where: {
        OR: [
          { email: data.email },
          { username: data.username },
        ],
      },
    });

    if (existing) {
      throw new ConflictException(
        existing.email === data.email
          ? 'El email ya está registrado'
          : 'El username ya está en uso',
      );
    }

    const plainPassword = data.password || this.generateTemporaryPassword();
    const password_hash = await bcrypt.hash(plainPassword, 12);

    this.logger.log(`Creando usuario: ${data.email} (tenant: ${tenant_id})`);

    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.users.create({
        data: {
          tenant_id,
          email: data.email,
          username: data.username,
          password_hash,
          first_name: data.first_name,
          last_name: data.last_name,
          document_number: data.document_number,
          document_type: data.document_type || 'CC',
          hire_date: data.hire_date ? new Date(data.hire_date) : null,
          blood_type: data.blood_type,
          eps: data.eps,
          pension_fund: data.pension_fund,
          address: data.address,
          city: data.city,
          department: data.department,
          country: data.country || 'Colombia',
          phone: data.phone,
          area_id: data.area_id || null,   // ✅ area_id sí existe en users
          avatar_url: data.avatar_url || null,
          signature_url: data.signature_url || null,
        },
        select: {
          id: true,
          email: true,
          username: true,
          first_name: true,
          last_name: true,
          document_number: true,
          phone: true,
          is_active: true,
          created_at: true,
        },
      });

      // ✅ sedes se asignan a través de user_sedes
      if (data.sede_ids?.length) {
        await tx.user_sedes.createMany({
          data: data.sede_ids.map((sede_id) => ({
            user_id: newUser.id,
            sede_id,
            area_id: data.area_id || null,
          })),
        });
      }

      // Asignar rol
      if (data.role_id) {
        await tx.user_roles.create({
          data: {
            user_id: newUser.id,
            role_id: data.role_id,
            assigned_by,
          },
        });
      }

      return newUser;
    });

    // Enviar credenciales por correo (no bloquea la respuesta)
    this.emailService
      .sendWelcomeCredentials(data.email, plainPassword, data.first_name)
      .catch((err) => this.logger.error('Error enviando credenciales por correo', err));

    return user;
  }

  // ─── ACTUALIZAR USUARIO ────────────────────────────────
  async update(id: string, tenant_id: string, data: {
    email?: string;
    first_name?: string;
    last_name?: string;
    avatar_url?: string;
    document_number?: string;
    document_type?: string;
    hire_date?: string;
    blood_type?: string;
    eps?: string;
    pension_fund?: string;
    address?: string;
    city?: string;
    department?: string;
    country?: string;
    phone?: string;
    phone_alt?: string;
    area_id?: string | null;
    sede_id?: string | null;  // ✅ Se usa para user_sedes
    is_active?: boolean;
    role_id?: string;
  }, updated_by?: string) {
    const user = await this.prisma.users.findFirst({
      where: { id, tenant_id },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedUser = await tx.users.update({
        where: { id },
        data: {
          first_name: data.first_name,
          last_name: data.last_name,
          avatar_url: data.avatar_url,
          document_number: data.document_number,
          document_type: data.document_type,
          hire_date: data.hire_date ? new Date(data.hire_date) : undefined,
          blood_type: data.blood_type,
          eps: data.eps,
          pension_fund: data.pension_fund,
          address: data.address,
          city: data.city,
          department: data.department,
          country: data.country,
          phone: data.phone,
          area_id: data.area_id,  // ✅ area_id sí existe en users
          is_active: data.is_active,
        },
        select: {
          id: true,
          email: true,
          username: true,
          first_name: true,
          last_name: true,
          document_number: true,
          phone: true,
          avatar_url: true,
          is_active: true,
          updated_at: true,
          area: { select: { id: true, name: true } },
          // ✅ sede va a través de user_sedes
          user_sedes: {
            select: {
              sede: { select: { id: true, name: true } },
            },
          },
        },
      });

      // ✅ Actualizar sede a través de user_sedes
      if (data.sede_id !== undefined) {
        // Eliminar todas las sedes actuales del usuario
        await tx.user_sedes.deleteMany({ where: { user_id: id } });

        if (data.sede_id) {
          await tx.user_sedes.create({
            data: {
              user_id: id,
              sede_id: data.sede_id,
              area_id: data.area_id || null,
            },
          });
        }
      }

      // Reemplazar rol si se envía
      if (data.role_id !== undefined) {
        await tx.user_roles.deleteMany({ where: { user_id: id } });

        if (data.role_id) {
          await tx.user_roles.create({
            data: {
              user_id: id,
              role_id: data.role_id,
              assigned_by: updated_by,
            },
          });
        }
      }

      return {
        ...updatedUser,
        sedes: updatedUser.user_sedes.map((us) => us.sede),
        user_sedes: undefined,
      };
    });
  }

  // ─── ELIMINAR USUARIO ──────────────────────────────────
  async remove(id: string, tenant_id: string) {
    const user = await this.prisma.users.findFirst({
      where: { id, tenant_id },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    await this.prisma.users.delete({ where: { id } });

    this.logger.warn(`Usuario eliminado: ${id} (tenant: ${tenant_id})`);
    return { message: 'Usuario eliminado exitosamente' };
  }

  // ─── CAMBIAR CONTRASEÑA ────────────────────────────────
  async changePassword(id: string, tenant_id: string, data: {
    new_password: string;
  }, changed_by: string) {
    const user = await this.prisma.users.findFirst({
      where: { id, tenant_id },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const password_hash = await bcrypt.hash(data.new_password, 12);

    await this.prisma.$transaction(async (tx) => {
      await tx.password_history.create({
        data: {
          user_id: id,
          password_hash: user.password_hash,
          changed_by,
        },
      });

      await tx.users.update({
        where: { id },
        data: { password_hash },
      });
    });

    return { message: 'Contraseña actualizada exitosamente' };
  }

  // ─── DESACTIVAR / ACTIVAR USUARIO ─────────────────────
  async toggleStatus(id: string, tenant_id: string) {
    const user = await this.prisma.users.findFirst({
      where: { id, tenant_id },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const updated = await this.prisma.users.update({
      where: { id },
      data: { is_active: !user.is_active },
      select: { id: true, is_active: true },
    });

    return {
      message: updated.is_active ? 'Usuario activado' : 'Usuario desactivado',
      is_active: updated.is_active,
    };
  }

  // ─── ROLES DEL USUARIO ─────────────────────────────────
  async getUserRoles(id: string, tenant_id: string) {
    const user = await this.prisma.users.findFirst({
      where: { id, tenant_id },
      select: {
        user_roles: {
          select: {
            assigned_at: true,
            expires_at: true,
            role: { select: { id: true, name: true, description: true } },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return user.user_roles.map((ur) => ({
      ...ur.role,
      assigned_at: ur.assigned_at,
      expires_at: ur.expires_at,
    }));
  }

  // ─── ASIGNAR ROLES ─────────────────────────────────────
  async assignRoles(id: string, tenant_id: string, data: {
    role_ids: string[];
    expires_at?: string;
  }, assigned_by: string) {
    const user = await this.prisma.users.findFirst({
      where: { id, tenant_id },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const roles = await this.prisma.roles.findMany({
      where: {
        id: { in: data.role_ids },
        tenant_id,
        is_active: true,
      },
    });

    if (roles.length !== data.role_ids.length) {
      throw new NotFoundException('Uno o más roles no encontrados en este tenant');
    }

    await this.prisma.user_roles.createMany({
      data: data.role_ids.map((role_id) => ({
        user_id: id,
        role_id,
        assigned_by,
        expires_at: data.expires_at ? new Date(data.expires_at) : null,
      })),
      skipDuplicates: true,
    });

    return { message: 'Roles asignados exitosamente' };
  }

  // ─── QUITAR ROL ────────────────────────────────────────
  async removeRole(user_id: string, role_id: string, tenant_id: string) {
    const user = await this.prisma.users.findFirst({
      where: { id: user_id, tenant_id },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    await this.prisma.user_roles.delete({
      where: {
        user_id_role_id: { user_id, role_id },
      },
    });

    return { message: 'Rol removido exitosamente' };
  }

  // ─── PERMISOS DEL USUARIO (COMBINADOS) ─────────────────
  async getUserPermissions(id: string, tenant_id: string) {
    const user = await this.prisma.users.findFirst({
      where: { id, tenant_id },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const rolePermissions = await this.prisma.$queryRaw`
      SELECT DISTINCT p.id as permission_id, p.module, p.submodule, p.action
      FROM user_roles ur
      JOIN role_permissions rp ON rp.role_id = ur.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = ${id}::uuid
      AND p.tenant_id = ${tenant_id}::uuid
    ` as { permission_id: string; module: string; submodule: string; action: string }[];

    const extraPermissions = await this.prisma.user_permissions.findMany({
      where: { user_id: id },
      include: {
        permission: {
          select: { id: true, module: true, submodule: true, action: true },
        },
      },
    });

    const rolePermsFormatted = rolePermissions.map((p) => ({
      id: p.permission_id,
      module: p.module,
      submodule: p.submodule,
      action: p.action,
      full: `${p.module}.${p.submodule}.${p.action}`,
      source: 'role' as const,
    }));

    const extraPermsFormatted = extraPermissions.map((up) => ({
      id: up.permission.id,
      module: up.permission.module,
      submodule: up.permission.submodule,
      action: up.permission.action,
      full: `${up.permission.module}.${up.permission.submodule}.${up.permission.action}`,
      source: 'user' as const,
    }));

    const allPerms: Array<{ id: string; module: string; submodule: string; action: string; full: string; source: 'role' | 'user' }> = [...rolePermsFormatted];
    for (const extra of extraPermsFormatted) {
      if (!allPerms.some((p) => p.id === extra.id)) {
        allPerms.push(extra);
      }
    }

    return allPerms;
  }

  // ─── ASIGNAR PERMISOS EXTRA ─────────────────────────────
  async assignExtraPermissions(id: string, tenant_id: string, data: {
    permission_ids: string[];
  }, granted_by: string) {
    const user = await this.prisma.users.findFirst({
      where: { id, tenant_id },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const permissions = await this.prisma.permissions.findMany({
      where: {
        id: { in: data.permission_ids },
        tenant_id,
      },
    });

    if (permissions.length !== data.permission_ids.length) {
      throw new NotFoundException('Uno o más permisos no encontrados en este tenant');
    }

    await this.prisma.user_permissions.createMany({
      data: data.permission_ids.map((permission_id) => ({
        user_id: id,
        permission_id,
        granted_by,
      })),
      skipDuplicates: true,
    });

    return { message: 'Permisos extra asignados exitosamente' };
  }

  // ─── QUITAR PERMISO EXTRA ──────────────────────────────
  async removeExtraPermission(user_id: string, permission_id: string, tenant_id: string) {
    const user = await this.prisma.users.findFirst({
      where: { id: user_id, tenant_id },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    await this.prisma.user_permissions.delete({
      where: {
        user_id_permission_id: { user_id, permission_id },
      },
    });

    return { message: 'Permiso extra removido exitosamente' };
  }

  // ─── REEMPLAZAR PERMISOS EXTRA ─────────────────────────
  async replaceExtraPermissions(id: string, tenant_id: string, data: {
    permission_ids: string[];
  }, granted_by: string) {
    const user = await this.prisma.users.findFirst({
      where: { id, tenant_id },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (data.permission_ids.length > 0) {
      const permissions = await this.prisma.permissions.findMany({
        where: {
          id: { in: data.permission_ids },
          tenant_id,
        },
      });

      if (permissions.length !== data.permission_ids.length) {
        throw new NotFoundException('Uno o más permisos no encontrados en este tenant');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user_permissions.deleteMany({ where: { user_id: id } });

      if (data.permission_ids.length > 0) {
        await tx.user_permissions.createMany({
          data: data.permission_ids.map((permission_id) => ({
            user_id: id,
            permission_id,
            granted_by,
          })),
        });
      }
    });

    return { message: 'Permisos extra actualizados exitosamente' };
  }

  // ─── LISTAR ÁREAS ──────────────────────────────────────
  async getAreas(tenant_id: string) {
    return this.prisma.areas.findMany({
      where: { tenant_id, is_active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  // ─── LISTAR SEDES ──────────────────────────────────────
  async getSedes(tenant_id: string) {
    return this.prisma.sedes.findMany({
      where: { tenant_id, is_active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
}