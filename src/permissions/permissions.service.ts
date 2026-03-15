import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);

  constructor(private prisma: PrismaService) {}

  // ─── LISTAR PERMISOS ───────────────────────────────────
  async findAll(query: { module?: string; submodule?: string }) {
    const where: any = {};

    if (query.module) where.module = query.module;
    if (query.submodule) where.submodule = query.submodule;

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

  // ─── LISTAR AGRUPADOS POR MODULO ───────────────────────
  async findAllGrouped() {
    const permissions = await this.prisma.permissions.findMany({
      orderBy: [{ module: 'asc' }, { submodule: 'asc' }, { action: 'asc' }],
      select: {
        id: true,
        module: true,
        submodule: true,
        action: true,
        description: true,
      },
    });

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
  async findOne(id: string) {
    const permission = await this.prisma.permissions.findUnique({
      where: { id },
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
  async create(data: {
    module: string;
    submodule: string;
    action: string;
    description?: string;
  }) {
    const existing = await this.prisma.permissions.findFirst({
      where: {
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
      data,
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
  async createBulk(data: {
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
  async update(id: string, data: { description?: string }) {
    const permission = await this.prisma.permissions.findUnique({
      where: { id },
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
  async remove(id: string) {
    const permission = await this.prisma.permissions.findUnique({
      where: { id },
    });

    if (!permission) {
      throw new NotFoundException('Permiso no encontrado');
    }

    await this.prisma.permissions.delete({ where: { id } });

    return { message: 'Permiso eliminado exitosamente' };
  }
}
