import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, ParseUUIDPipe, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { AuditService } from '../common/services/audit.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/user-current.decorator';
import { CreatePermissionDto, CreateBulkPermissionsDto, UpdatePermissionDto } from './dto';
import type { Request } from 'express';

@ApiTags('Permissions')
@ApiBearerAuth('access-token')
@Controller('api/v1/permissions')
@UseGuards(JwtGuard, PermissionGuard)
export class PermissionsController {
  constructor(
    private permissionsService: PermissionsService,
    private auditService: AuditService,
  ) {}

  private auditCtx(userId: string, req: Request) {
    return { user_id: userId, ip_address: req.ip, user_agent: req.headers['user-agent'] as string };
  }

  @RequirePermission('configuracion', 'roles', 'ver')
  @Get()
  @ApiOperation({ summary: 'Listar permisos con filtro opcional' })
  @ApiQuery({ name: 'module', required: false, type: String })
  @ApiQuery({ name: 'submodule', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Lista de permisos' })
  findAll(@Query() query: { module?: string; submodule?: string }) {
    return this.permissionsService.findAll(query);
  }

  @RequirePermission('configuracion', 'roles', 'ver')
  @Get('grouped')
  @ApiOperation({ summary: 'Listar permisos agrupados por modulo y submodulo' })
  @ApiResponse({ status: 200, description: 'Permisos agrupados' })
  findAllGrouped() {
    return this.permissionsService.findAllGrouped();
  }

  @RequirePermission('configuracion', 'roles', 'ver')
  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de un permiso' })
  @ApiResponse({ status: 200, description: 'Detalle del permiso' })
  @ApiResponse({ status: 404, description: 'Permiso no encontrado' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.permissionsService.findOne(id);
  }

  @RequirePermission('configuracion', 'roles', 'crear')
  @Post()
  @ApiOperation({ summary: 'Crear permiso' })
  @ApiResponse({ status: 201, description: 'Permiso creado' })
  @ApiResponse({ status: 409, description: 'El permiso ya existe' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() body: CreatePermissionDto,
    @Req() req: Request,
  ) {
    const result = await this.permissionsService.create(body);

    this.auditService.log({
      context: this.auditCtx(userId, req),
      module: 'configuracion', submodule: 'permisos', action: 'crear',
      resource_id: result.id,
      new_data: { module: body.module, submodule: body.submodule, action: body.action },
    });

    return result;
  }

  @RequirePermission('configuracion', 'roles', 'crear')
  @Post('bulk')
  @ApiOperation({ summary: 'Crear permisos en lote' })
  @ApiResponse({ status: 201, description: 'Resultado de creacion masiva' })
  async createBulk(
    @CurrentUser('id') userId: string,
    @Body() body: CreateBulkPermissionsDto,
    @Req() req: Request,
  ) {
    const result = await this.permissionsService.createBulk(body);

    this.auditService.log({
      context: this.auditCtx(userId, req),
      module: 'configuracion', submodule: 'permisos', action: 'crear_masivo',
      new_data: { count: result.results.filter((r) => r.status === 'created').length },
    });

    return result;
  }

  @RequirePermission('configuracion', 'roles', 'editar')
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar descripcion del permiso' })
  @ApiResponse({ status: 200, description: 'Permiso actualizado' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() body: UpdatePermissionDto,
    @Req() req: Request,
  ) {
    const result = await this.permissionsService.update(id, body);

    this.auditService.log({
      context: this.auditCtx(userId, req),
      module: 'configuracion', submodule: 'permisos', action: 'editar',
      resource_id: id,
      new_data: body,
    });

    return result;
  }

  @RequirePermission('configuracion', 'roles', 'eliminar')
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar permiso' })
  @ApiResponse({ status: 200, description: 'Permiso eliminado' })
  @ApiResponse({ status: 404, description: 'Permiso no encontrado' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @Req() req: Request,
  ) {
    const result = await this.permissionsService.remove(id);

    this.auditService.log({
      context: this.auditCtx(userId, req),
      module: 'configuracion', submodule: 'permisos', action: 'eliminar',
      resource_id: id,
    });

    return result;
  }
}
