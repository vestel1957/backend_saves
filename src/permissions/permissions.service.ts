import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);

  constructor(private prisma: PrismaService) {}

  // ─── LISTAR PERMISOS ───────────────────────────────────
  async findAll(tenant_id: string, query: { module?: string; submodule?: string }) {
    const where: any = { tenant_id };

    if (query.module) {
      where.module = query.module;
    }

    if (query.submodule) {
      where.submodule = query.submodule;
    }

    return this.prisma.permissions.findMany({
      where,
      orderBy: [{ module: 'asc' }, { submodule: 'asc' }, { action: 'asc' }],
      select: {
        id: true,
        module: true,
        submodule: true,
        action: true,
        description: true,
        created_at: true,
      },
    });
  }

  // ─── LISTAR AGRUPADOS POR MÓDULO ───────────────────────
  // Retorna los permisos organizados por módulo y submódulo
  async findAllGrouped(tenant_id: string) {
    const permissions = await this.prisma.permissions.findMany({
      where: { tenant_id },
      orderBy: [{ module: 'asc' }, { submodule: 'asc' }, { action: 'asc' }],
      select: {
        id: true,
        module: true,
        submodule: true,
        action: true,
        description: true,
      },
    });

    // Agrupar por módulo → submódulo → acciones
    const grouped: Record<string, Record<string, any[]>> = {};

    for (const perm of permissions) {
      if (!grouped[perm.module]) {
        grouped[perm.module] = {};
      }
      if (!grouped[perm.module][perm.submodule]) {
        grouped[perm.module][perm.submodule] = [];
      }
      grouped[perm.module][perm.submodule].push({
        id: perm.id,
        action: perm.action,
        description: perm.description,
        full: `${perm.module}.${perm.submodule}.${perm.action}`,
      });
    }

    return grouped;
  }

  // ─── OBTENER UN PERMISO ────────────────────────────────
  async findOne(id: string, tenant_id: string) {
    const permission = await this.prisma.permissions.findFirst({
      where: { id, tenant_id },
      select: {
        id: true,
        module: true,
        submodule: true,
        action: true,
        description: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!permission) {
      throw new NotFoundException('Permiso no encontrado');
    }

    return permission;
  }

  // ─── CREAR PERMISO ─────────────────────────────────────
  async create(tenant_id: string, data: {
    module: string;
    submodule: string;
    action: string;
    description?: string;
  }) {
    // Verificar que no exista la misma combinación en el tenant
    const existing = await this.prisma.permissions.findFirst({
      where: {
        tenant_id,
        module: data.module,
        submodule: data.submodule,
        action: data.action,
      },
    });

    if (existing) {
      throw new ConflictException(
        `El permiso ${data.module}.${data.submodule}.${data.action} ya existe`,
      );
    }

    return this.prisma.permissions.create({
      data: {
        tenant_id,
        ...data,
      },
      select: {
        id: true,
        module: true,
        submodule: true,
        action: true,
        description: true,
        created_at: true,
      },
    });
  }

  // ─── CREAR PERMISOS MASIVOS ────────────────────────────
  // Crea varios permisos de una sola vez
  async createBulk(tenant_id: string, data: {
    permissions: {
      module: string;
      submodule: string;
      action: string;
      description?: string;
    }[];
  }) {
    const results: {
        module: string;
        submodule: string;
        action: string;
        status: string;
        id?: string;
        description?: string | null;
    }[] = [];

    for (const perm of data.permissions) {
      try {
        const created = await this.prisma.permissions.create({
          data: {
            tenant_id,
            module: perm.module,
            submodule: perm.submodule,
            action: perm.action,
            description: perm.description,
          },
          select: {
            id: true,
            module: true,
            submodule: true,
            action: true,
            description: true,
          },
        });
        results.push({ ...created, status: 'created' });
      } catch {
        results.push({
          module: perm.module,
          submodule: perm.submodule,
          action: perm.action,
          status: 'already_exists',
        });
      }
    }

    return {
      message: `${results.filter((r) => r.status === 'created').length} permisos creados`,
      results,
    };
  }

  // ─── ACTUALIZAR PERMISO ────────────────────────────────
  async update(id: string, tenant_id: string, data: {
    description?: string;
  }) {
    const permission = await this.prisma.permissions.findFirst({
      where: { id, tenant_id },
    });

    if (!permission) {
      throw new NotFoundException('Permiso no encontrado');
    }

    return this.prisma.permissions.update({
      where: { id },
      data,
      select: {
        id: true,
        module: true,
        submodule: true,
        action: true,
        description: true,
        updated_at: true,
      },
    });
  }

  // ─── ELIMINAR PERMISO ──────────────────────────────────
  async remove(id: string, tenant_id: string) {
    const permission = await this.prisma.permissions.findFirst({
      where: { id, tenant_id },
    });

    if (!permission) {
      throw new NotFoundException('Permiso no encontrado');
    }

    await this.prisma.permissions.delete({ where: { id } });

    return { message: 'Permiso eliminado exitosamente' };
  }
}