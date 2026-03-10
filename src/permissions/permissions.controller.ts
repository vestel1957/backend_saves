import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/user-current.decorator';
import { CreatePermissionDto, CreateBulkPermissionsDto, UpdatePermissionDto } from './dto';

@ApiTags('Permissions')
@ApiBearerAuth('access-token')
@Controller('api/v1/permissions')
@UseGuards(JwtGuard, PermissionGuard)
export class PermissionsController {
  constructor(private permissionsService: PermissionsService) {}

  @RequirePermission('configuracion', 'roles', 'ver')
  @Get()
  @ApiOperation({ summary: 'Listar permisos con filtro opcional' })
  @ApiQuery({ name: 'module', required: false, type: String })
  @ApiQuery({ name: 'submodule', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Lista de permisos' })
  findAll(
    @CurrentUser('tenant_id') tenantId: string,
    @Query() query: { module?: string; submodule?: string },
  ) {
    return this.permissionsService.findAll(tenantId, query);
  }

  @RequirePermission('configuracion', 'roles', 'ver')
  @Get('grouped')
  @ApiOperation({ summary: 'Listar permisos agrupados por módulo y submódulo' })
  @ApiResponse({ status: 200, description: 'Permisos agrupados' })
  findAllGrouped(@CurrentUser('tenant_id') tenantId: string) {
    return this.permissionsService.findAllGrouped(tenantId);
  }

  @RequirePermission('configuracion', 'roles', 'ver')
  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de un permiso' })
  @ApiResponse({ status: 200, description: 'Detalle del permiso' })
  @ApiResponse({ status: 404, description: 'Permiso no encontrado' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    return this.permissionsService.findOne(id, tenantId);
  }

  @RequirePermission('configuracion', 'roles', 'crear')
  @Post()
  @ApiOperation({ summary: 'Crear permiso' })
  @ApiResponse({ status: 201, description: 'Permiso creado' })
  @ApiResponse({ status: 409, description: 'El permiso ya existe' })
  create(
    @CurrentUser('tenant_id') tenantId: string,
    @Body() body: CreatePermissionDto,
  ) {
    return this.permissionsService.create(tenantId, body);
  }

  @RequirePermission('configuracion', 'roles', 'crear')
  @Post('bulk')
  @ApiOperation({ summary: 'Crear permisos en lote' })
  @ApiResponse({ status: 201, description: 'Resultado de creación masiva' })
  createBulk(
    @CurrentUser('tenant_id') tenantId: string,
    @Body() body: CreateBulkPermissionsDto,
  ) {
    return this.permissionsService.createBulk(tenantId, body);
  }

  @RequirePermission('configuracion', 'roles', 'editar')
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar descripción del permiso' })
  @ApiResponse({ status: 200, description: 'Permiso actualizado' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenant_id') tenantId: string,
    @Body() body: UpdatePermissionDto,
  ) {
    return this.permissionsService.update(id, tenantId, body);
  }

  @RequirePermission('configuracion', 'roles', 'eliminar')
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar permiso' })
  @ApiResponse({ status: 200, description: 'Permiso eliminado' })
  @ApiResponse({ status: 404, description: 'Permiso no encontrado' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    return this.permissionsService.remove(id, tenantId);
  }
}
