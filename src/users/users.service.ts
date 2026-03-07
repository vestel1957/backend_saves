import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

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
          is_active: true,
          is_verified: true,
          last_login_at: true,
          created_at: true,
          user_roles: {
            include: {
              role: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.users.count({ where }),
    ]);

    const formatted = users.map((user) => ({
      ...user,
      roles: user.user_roles.map((ur) => ur.role),
      user_roles: undefined,
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
        is_active: true,
        is_verified: true,
        is_super_admin: true,
        last_login_at: true,
        created_at: true,
        updated_at: true,
        user_roles: {
          include: {
            role: {
              select: { id: true, name: true, description: true },
            },
          },
        },
        user_permissions: {
          include: {
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
      extra_permissions: user.user_permissions.map((up) => ({
        id: up.permission.id,
        module: up.permission.module,
        submodule: up.permission.submodule,
        action: up.permission.action,
        full: `${up.permission.module}.${up.permission.submodule}.${up.permission.action}`,
      })),
      user_roles: undefined,
      user_permissions: undefined,
    };
  }

  // ─── CREAR USUARIO ─────────────────────────────────────
  async create(tenant_id: string, data: {
    email: string;
    username: string;
    password: string;
    first_name?: string;
    last_name?: string;
    role_ids?: string[];
    extra_permission_ids?: string[];
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

    const password_hash = await bcrypt.hash(data.password, 12);

    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.users.create({
        data: {
          tenant_id,
          email: data.email,
          username: data.username,
          password_hash,
          first_name: data.first_name,
          last_name: data.last_name,
        },
        select: {
          id: true,
          email: true,
          username: true,
          first_name: true,
          last_name: true,
          is_active: true,
          created_at: true,
        },
      });

      // Asignar roles
      if (data.role_ids && data.role_ids.length > 0) {
        await tx.user_roles.createMany({
          data: data.role_ids.map((role_id) => ({
            user_id: newUser.id,
            role_id,
            assigned_by,
          })),
        });
      }

      // Asignar permisos extra individuales
      if (data.extra_permission_ids && data.extra_permission_ids.length > 0) {
        await tx.user_permissions.createMany({
          data: data.extra_permission_ids.map((permission_id) => ({
            user_id: newUser.id,
            permission_id,
            granted_by: assigned_by,
          })),
        });
      }

      return newUser;
    });

    return user;
  }

  // ─── ACTUALIZAR USUARIO ────────────────────────────────
  async update(id: string, tenant_id: string, data: {
    first_name?: string;
    last_name?: string;
    avatar_url?: string;
    is_active?: boolean;
    role_ids?: string[];
    extra_permission_ids?: string[];
  }, updated_by?: string) {
    const user = await this.prisma.users.findFirst({
      where: { id, tenant_id },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return this.prisma.$transaction(async (tx) => {
      // Actualizar info personal
      const updatedUser = await tx.users.update({
        where: { id },
        data: {
          first_name: data.first_name,
          last_name: data.last_name,
          avatar_url: data.avatar_url,
          is_active: data.is_active,
        },
        select: {
          id: true,
          email: true,
          username: true,
          first_name: true,
          last_name: true,
          avatar_url: true,
          is_active: true,
          updated_at: true,
        },
      });

      // Si se envían roles, reemplazar todos
      if (data.role_ids !== undefined) {
        await tx.user_roles.deleteMany({ where: { user_id: id } });

        if (data.role_ids.length > 0) {
          await tx.user_roles.createMany({
            data: data.role_ids.map((role_id) => ({
              user_id: id,
              role_id,
              assigned_by: updated_by,
            })),
          });
        }
      }

      // Si se envían permisos extra, reemplazar todos
      if (data.extra_permission_ids !== undefined) {
        await tx.user_permissions.deleteMany({ where: { user_id: id } });

        if (data.extra_permission_ids.length > 0) {
          await tx.user_permissions.createMany({
            data: data.extra_permission_ids.map((permission_id) => ({
              user_id: id,
              permission_id,
              granted_by: updated_by,
            })),
          });
        }
      }

      return updatedUser;
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

    return { message: 'Usuario eliminado exitosamente' };
  }

  // ─── ROLES DEL USUARIO ─────────────────────────────────
  async getUserRoles(id: string, tenant_id: string) {
    const user = await this.prisma.users.findFirst({
      where: { id, tenant_id },
      select: {
        user_roles: {
          include: {
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
  // Retorna permisos del rol + permisos extra individuales
  async getUserPermissions(id: string, tenant_id: string) {
    const user = await this.prisma.users.findFirst({
      where: { id, tenant_id },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Permisos heredados de los roles
    const rolePermissions = await this.prisma.$queryRaw`
      SELECT DISTINCT p.id as permission_id, p.module, p.submodule, p.action
      FROM user_roles ur
      JOIN role_permissions rp ON rp.role_id = ur.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = ${id}::uuid
      AND p.tenant_id = ${tenant_id}::uuid
    ` as { permission_id: string; module: string; submodule: string; action: string }[];

    // Permisos extra individuales del usuario
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

    // Combinar sin duplicados (prioridad al source)
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

    // Verificar que los permisos pertenecen al tenant
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
  // Reemplaza todos los permisos extra de un usuario
  async replaceExtraPermissions(id: string, tenant_id: string, data: {
    permission_ids: string[];
  }, granted_by: string) {
    const user = await this.prisma.users.findFirst({
      where: { id, tenant_id },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Verificar permisos del tenant
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
      // Borrar todos los extra actuales
      await tx.user_permissions.deleteMany({ where: { user_id: id } });

      // Crear los nuevos
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
}