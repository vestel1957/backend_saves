import { Injectable, NotFoundException, ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Detecta ciclos en la jerarquia de roles.
   * Recorre la cadena de parent_role_id para verificar que asignar
   * parent_role_id a role_id no cree una referencia circular.
   */
  private async detectCycle(role_id: string, parent_role_id: string, tenant_id: string): Promise<boolean> {
    const visited = new Set<string>();
    let current: string | null = parent_role_id;

    while (current) {
      if (current === role_id) {
        return true; // Ciclo detectado
      }
      if (visited.has(current)) {
        return false; // Ya visitado, no hay ciclo con role_id
      }
      visited.add(current);

      const parent = await this.prisma.roles.findFirst({
        where: { id: current, tenant_id },
        select: { parent_role_id: true },
      });

      current = parent?.parent_role_id ?? null;
    }

    return false;
  }

  // ─── LISTAR ROLES ──────────────────────────────────────
  async findAll(tenant_id: string, query: { is_active?: boolean }) {
    const where: any = { tenant_id };

    if (query.is_active !== undefined) {
      where.is_active = query.is_active;
    }

    const roles = await this.prisma.roles.findMany({
      where,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        is_active: true,
        is_system: true,
        parent_role_id: true,
        created_at: true,
        parent_role: { select: { id: true, name: true } },
        _count: {
          select: {
            user_roles: true,
            role_permissions: true,
          },
        },
      },
    });

    return roles.map((role) => ({
      ...role,
      total_users: role._count.user_roles,
      total_permissions: role._count.role_permissions,
      _count: undefined,
    }));
  }

  // ─── OBTENER UN ROL ────────────────────────────────────
  async findOne(id: string, tenant_id: string) {
    const role = await this.prisma.roles.findFirst({
      where: { id, tenant_id },
      select: {
        id: true,
        name: true,
        description: true,
        is_active: true,
        is_system: true,
        parent_role_id: true,
        created_at: true,
        updated_at: true,
        parent_role: { select: { id: true, name: true } },
        child_roles: { select: { id: true, name: true } },
        role_permissions: {
          include: {
            permission: {
              select: { id: true, module: true, submodule: true, action: true },
            },
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException('Rol no encontrado');
    }

    return {
      ...role,
      permissions: role.role_permissions.map((rp) => ({
        ...rp.permission,
        full: `${rp.permission.module}.${rp.permission.submodule}.${rp.permission.action}`,
      })),
      role_permissions: undefined,
    };
  }

  // ─── CREAR ROL ─────────────────────────────────────────
  async create(tenant_id: string, data: {
    name: string;
    description?: string;
    parent_role_id?: string;
    permission_ids?: string[];
  }) {
    // Verificar nombre único en el tenant
    const existing = await this.prisma.roles.findFirst({
      where: { tenant_id, name: data.name },
    });

    if (existing) {
      throw new ConflictException('Ya existe un rol con ese nombre');
    }

    // Verificar que el rol padre existe y es del mismo tenant
    if (data.parent_role_id) {
      const parent = await this.prisma.roles.findFirst({
        where: { id: data.parent_role_id, tenant_id },
      });

      if (!parent) {
        throw new NotFoundException('Rol padre no encontrado en este tenant');
      }
    }

    // Crear rol y asignar permisos en transaccion
    const role = await this.prisma.$transaction(async (tx) => {
      const newRole = await tx.roles.create({
        data: {
          tenant_id,
          name: data.name,
          description: data.description,
          parent_role_id: data.parent_role_id,
        },
        select: {
          id: true,
          name: true,
          description: true,
          is_active: true,
          created_at: true,
        },
      });

      if (data.permission_ids && data.permission_ids.length > 0) {
        // Verificar que los permisos son del mismo tenant
        const permissions = await tx.permissions.findMany({
          where: {
            id: { in: data.permission_ids },
            tenant_id,
          },
        });

        if (permissions.length !== data.permission_ids.length) {
          throw new NotFoundException('Uno o más permisos no encontrados en este tenant');
        }

        await tx.role_permissions.createMany({
          data: data.permission_ids.map((permission_id) => ({
            role_id: newRole.id,
            permission_id,
          })),
        });
      }

      return newRole;
    });

    this.logger.log(`Rol creado: ${role.name} (tenant: ${tenant_id})`);
    return role;
  }

  // ─── ACTUALIZAR ROL ────────────────────────────────────
  async update(id: string, tenant_id: string, data: {
    name?: string;
    description?: string;
    is_active?: boolean;
    parent_role_id?: string;
  }) {
    const role = await this.prisma.roles.findFirst({
      where: { id, tenant_id },
    });

    if (!role) {
      throw new NotFoundException('Rol no encontrado');
    }

    if (role.is_system) {
      throw new ForbiddenException('No se puede modificar un rol del sistema');
    }

    // Si cambia el padre, verificar que no cree un ciclo
    if (data.parent_role_id) {
      if (data.parent_role_id === id) {
        throw new ConflictException('Un rol no puede ser su propio padre');
      }

      const parent = await this.prisma.roles.findFirst({
        where: { id: data.parent_role_id, tenant_id },
      });

      if (!parent) {
        throw new NotFoundException('Rol padre no encontrado en este tenant');
      }

      const hasCycle = await this.detectCycle(id, data.parent_role_id, tenant_id);
      if (hasCycle) {
        throw new ConflictException(
          'No se puede asignar este rol padre porque crearia una referencia circular en la jerarquia',
        );
      }
    }

    // Si cambia el nombre, verificar que no exista otro con ese nombre
    if (data.name && data.name !== role.name) {
      const existing = await this.prisma.roles.findFirst({
        where: { tenant_id, name: data.name, id: { not: id } },
      });

      if (existing) {
        throw new ConflictException('Ya existe un rol con ese nombre');
      }
    }

    return this.prisma.roles.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        description: true,
        is_active: true,
        updated_at: true,
      },
    });
  }

  // ─── ELIMINAR ROL ──────────────────────────────────────
  async remove(id: string, tenant_id: string) {
    const role = await this.prisma.roles.findFirst({
      where: { id, tenant_id },
    });

    if (!role) {
      throw new NotFoundException('Rol no encontrado');
    }

    if (role.is_system) {
      throw new ForbiddenException('No se puede eliminar un rol del sistema');
    }

    await this.prisma.roles.delete({ where: { id } });

    this.logger.warn(`Rol eliminado: ${id} (tenant: ${tenant_id})`);
    return { message: 'Rol eliminado exitosamente' };
  }

  // ─── PERMISOS DEL ROL ──────────────────────────────────
  async getRolePermissions(id: string, tenant_id: string) {
    const role = await this.prisma.roles.findFirst({
      where: { id, tenant_id },
      select: {
        role_permissions: {
          include: {
            permission: {
              select: { id: true, module: true, submodule: true, action: true, description: true },
            },
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException('Rol no encontrado');
    }

    return role.role_permissions.map((rp) => ({
      ...rp.permission,
      full: `${rp.permission.module}.${rp.permission.submodule}.${rp.permission.action}`,
    }));
  }

  // ─── ASIGNAR PERMISOS AL ROL ───────────────────────────
  async assignPermissions(id: string, tenant_id: string, data: {
    permission_ids: string[];
  }) {
    const role = await this.prisma.roles.findFirst({
      where: { id, tenant_id },
    });

    if (!role) {
      throw new NotFoundException('Rol no encontrado');
    }

    // Verificar que los permisos son del mismo tenant
    const permissions = await this.prisma.permissions.findMany({
      where: {
        id: { in: data.permission_ids },
        tenant_id,
      },
    });

    if (permissions.length !== data.permission_ids.length) {
      throw new NotFoundException('Uno o más permisos no encontrados en este tenant');
    }

    await this.prisma.role_permissions.createMany({
      data: data.permission_ids.map((permission_id) => ({
        role_id: id,
        permission_id,
      })),
      skipDuplicates: true,
    });

    return { message: 'Permisos asignados exitosamente' };
  }

  // ─── QUITAR PERMISO DEL ROL ────────────────────────────
  async removePermission(role_id: string, permission_id: string, tenant_id: string) {
    const role = await this.prisma.roles.findFirst({
      where: { id: role_id, tenant_id },
    });

    if (!role) {
      throw new NotFoundException('Rol no encontrado');
    }

    await this.prisma.role_permissions.delete({
      where: {
        role_id_permission_id: { role_id, permission_id },
      },
    });

    return { message: 'Permiso removido exitosamente' };
  }

  // ─── USUARIOS DEL ROL ──────────────────────────────────
  async getRoleUsers(id: string, tenant_id: string) {
    const role = await this.prisma.roles.findFirst({
      where: { id, tenant_id },
      select: {
        user_roles: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                username: true,
                first_name: true,
                last_name: true,
                is_active: true,
              },
            },
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException('Rol no encontrado');
    }

    return role.user_roles.map((ur) => ({
      ...ur.user,
      assigned_at: ur.assigned_at,
      expires_at: ur.expires_at,
    }));
  }
}