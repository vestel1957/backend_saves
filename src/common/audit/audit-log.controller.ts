import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from '../services/audit.service';
import { JwtGuard } from '../../auth/guards/jwt.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AuditLogQueryDto } from '../dto/audit-log-query.dto';

@ApiTags('Audit')
@ApiBearerAuth('access-token')
@Controller('api/v1/audit-logs')
@UseGuards(JwtGuard, PermissionGuard)
export class AuditLogController {
  constructor(private auditService: AuditService) {}

  @RequirePermission('sistema', 'auditoria', 'ver')
  @Get()
  @ApiOperation({ summary: 'Consultar logs de auditoria con filtros' })
  @ApiResponse({ status: 200, description: 'Lista paginada de audit logs' })
  findAll(@Query() query: AuditLogQueryDto) {
    return this.auditService.findAll(query);
  }
}
