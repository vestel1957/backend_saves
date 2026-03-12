import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate, PaginatedResult } from '../helpers/paginate';

export interface AuditContext {
  user_id: string;
  tenant_id: string;
  ip_address?: string;
  user_agent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  async log(params: {
    context: AuditContext;
    module: string;
    submodule?: string;
    action: string;
    resource_id?: string;
    old_data?: any;
    new_data?: any;
  }) {
    try {
      await this.prisma.audit_log.create({
        data: {
          tenant_id: params.context.tenant_id,
          user_id: params.context.user_id,
          module: params.module,
          submodule: params.submodule || null,
          action: params.action,
          resource_id: params.resource_id || null,
          old_data: params.old_data ?? undefined,
          new_data: params.new_data ?? undefined,
          ip_address: params.context.ip_address || null,
          user_agent: params.context.user_agent || null,
        },
      });
    } catch (error) {
      // Nunca dejar que un fallo de auditoría rompa la operación principal
      this.logger.error('Error registrando audit log', error);
    }
  }

  async findAll(
    tenant_id: string,
    isSuperAdmin: boolean,
    query: {
      page?: number;
      limit?: number;
      module?: string;
      submodule?: string;
      action?: string;
      user_id?: string;
      resource_id?: string;
      date_from?: string;
      date_to?: string;
    },
  ): Promise<PaginatedResult<any>> {
    const where: any = {};

    // Super admin puede ver todos los tenants, usuarios normales solo el suyo
    if (!isSuperAdmin) {
      where.tenant_id = tenant_id;
    }

    if (query.module) where.module = query.module;
    if (query.submodule) where.submodule = query.submodule;
    if (query.action) where.action = query.action;
    if (query.user_id) where.user_id = query.user_id;
    if (query.resource_id) where.resource_id = query.resource_id;

    if (query.date_from || query.date_to) {
      where.created_at = {};
      if (query.date_from) where.created_at.gte = new Date(query.date_from);
      if (query.date_to) where.created_at.lte = new Date(query.date_to);
    }

    return paginate(this.prisma.audit_log, {
      where,
      orderBy: { created_at: 'desc' },
      include: {
        user: { select: { id: true, email: true, first_name: true, last_name: true } },
      },
    }, { page: query.page, limit: query.limit });
  }
}
