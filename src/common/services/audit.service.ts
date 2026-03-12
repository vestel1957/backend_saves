import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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
}
