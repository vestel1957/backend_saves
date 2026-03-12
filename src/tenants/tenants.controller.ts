import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, ParseUUIDPipe, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { AuditService } from '../common/services/audit.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/user-current.decorator';
import { CreateTenantDto, UpdateTenantDto, UpdateSettingsDto } from './dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import type { Request } from 'express';

@ApiTags('Tenants')
@ApiBearerAuth('access-token')
@Controller('api/v1/tenants')
@UseGuards(JwtGuard, PermissionGuard)
export class TenantsController {
  constructor(
    private tenantsService: TenantsService,
    private auditService: AuditService,
  ) {}

  private auditCtx(userId: string, tenantId: string, req: Request) {
    return { user_id: userId, tenant_id: tenantId, ip_address: req.ip, user_agent: req.headers['user-agent'] as string };
  }

  @RequirePermission('sistema', 'tenants', 'ver')
  @Get()
  @ApiOperation({ summary: 'Listar tenants (organizaciones)' })
  @ApiResponse({ status: 200, description: 'Lista paginada de tenants' })
  findAll(@Query() query: PaginationQueryDto) {
    return this.tenantsService.findAll(query);
  }

  @RequirePermission('sistema', 'tenants', 'ver')
  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de un tenant' })
  @ApiResponse({ status: 200, description: 'Detalle del tenant' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantsService.findOne(id);
  }

  @RequirePermission('sistema', 'tenants', 'crear')
  @Post()
  @ApiOperation({ summary: 'Crear tenant con onboarding automático (permisos, rol admin, usuario)' })
  @ApiResponse({ status: 201, description: 'Tenant creado con admin' })
  @ApiResponse({ status: 409, description: 'Ya existe un tenant con ese nombre' })
  async create(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenant_id') tenantId: string,
    @Body() body: CreateTenantDto,
    @Req() req: Request,
  ) {
    const result = await this.tenantsService.create(body);

    this.auditService.log({
      context: this.auditCtx(userId, tenantId, req),
      module: 'sistema', submodule: 'tenants', action: 'crear',
      resource_id: result.id,
      new_data: { name: result.name, slug: result.slug, admin_email: result.admin_email },
    });

    return result;
  }

  @RequirePermission('sistema', 'tenants', 'editar')
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar tenant' })
  @ApiResponse({ status: 200, description: 'Tenant actualizado' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenant_id') tenantId: string,
    @Body() body: UpdateTenantDto,
    @Req() req: Request,
  ) {
    const result = await this.tenantsService.update(id, body);

    this.auditService.log({
      context: this.auditCtx(userId, tenantId, req),
      module: 'sistema', submodule: 'tenants', action: 'editar',
      resource_id: id,
      new_data: body,
    });

    return result;
  }

  @RequirePermission('sistema', 'tenants', 'editar')
  @Patch(':id/toggle-status')
  @ApiOperation({ summary: 'Activar/desactivar tenant' })
  @ApiResponse({ status: 200, description: 'Estado cambiado' })
  async toggleStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenant_id') tenantId: string,
    @Req() req: Request,
  ) {
    const result = await this.tenantsService.toggleStatus(id);

    this.auditService.log({
      context: this.auditCtx(userId, tenantId, req),
      module: 'sistema', submodule: 'tenants', action: 'toggle_status',
      resource_id: id,
      new_data: { is_active: result.is_active },
    });

    return result;
  }

  // ─── SETTINGS ────────────────────────────────────────

  @RequirePermission('sistema', 'tenants', 'ver')
  @Get(':id/settings')
  @ApiOperation({ summary: 'Obtener configuración del tenant' })
  @ApiResponse({ status: 200, description: 'Configuración JSON del tenant' })
  getSettings(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantsService.getSettings(id);
  }

  @RequirePermission('sistema', 'tenants', 'editar')
  @Patch(':id/settings')
  @ApiOperation({ summary: 'Actualizar configuración del tenant (merge parcial)' })
  @ApiResponse({ status: 200, description: 'Configuración actualizada' })
  async updateSettings(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenant_id') tenantId: string,
    @Body() body: UpdateSettingsDto,
    @Req() req: Request,
  ) {
    const result = await this.tenantsService.updateSettings(id, body.settings);

    this.auditService.log({
      context: this.auditCtx(userId, tenantId, req),
      module: 'sistema', submodule: 'tenants', action: 'editar_settings',
      resource_id: id,
      new_data: body.settings,
    });

    return result;
  }
}
