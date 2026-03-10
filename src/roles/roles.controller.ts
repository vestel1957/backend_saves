import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/user-current.decorator';
import { CreateRoleDto, UpdateRoleDto, AssignRolePermissionsDto } from './dto';

@ApiTags('Roles')
@ApiBearerAuth('access-token')
@Controller('api/v1/roles')
@UseGuards(JwtGuard, PermissionGuard)
export class RolesController {
  constructor(private rolesService: RolesService) {}

  @RequirePermission('configuracion', 'roles', 'ver')
  @Get()
  @ApiOperation({ summary: 'Listar roles' })
  @ApiQuery({ name: 'is_active', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Lista de roles con contadores' })
  findAll(
    @CurrentUser('tenant_id') tenantId: string,
    @Query() query: { is_active?: string },
  ) {
    return this.rolesService.findAll(tenantId, {
      is_active: query.is_active ? query.is_active === 'true' : undefined,
    });
  }

  @RequirePermission('configuracion', 'roles', 'ver')
  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de un rol' })
  @ApiResponse({ status: 200, description: 'Detalle del rol con permisos' })
  @ApiResponse({ status: 404, description: 'Rol no encontrado' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    return this.rolesService.findOne(id, tenantId);
  }

  @RequirePermission('configuracion', 'roles', 'crear')
  @Post()
  @ApiOperation({ summary: 'Crear rol con permisos opcionales' })
  @ApiResponse({ status: 201, description: 'Rol creado' })
  @ApiResponse({ status: 409, description: 'Ya existe un rol con ese nombre' })
  create(
    @CurrentUser('tenant_id') tenantId: string,
    @Body() body: CreateRoleDto,
  ) {
    return this.rolesService.create(tenantId, body);
  }

  @RequirePermission('configuracion', 'roles', 'editar')
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar rol' })
  @ApiResponse({ status: 200, description: 'Rol actualizado' })
  @ApiResponse({ status: 403, description: 'No se puede modificar rol del sistema' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenant_id') tenantId: string,
    @Body() body: UpdateRoleDto,
  ) {
    return this.rolesService.update(id, tenantId, body);
  }

  @RequirePermission('configuracion', 'roles', 'eliminar')
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar rol' })
  @ApiResponse({ status: 200, description: 'Rol eliminado' })
  @ApiResponse({ status: 403, description: 'No se puede eliminar rol del sistema' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    return this.rolesService.remove(id, tenantId);
  }

  @RequirePermission('configuracion', 'roles', 'ver')
  @Get(':id/permissions')
  @ApiOperation({ summary: 'Obtener permisos del rol' })
  @ApiResponse({ status: 200, description: 'Lista de permisos asignados' })
  getRolePermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    return this.rolesService.getRolePermissions(id, tenantId);
  }

  @RequirePermission('configuracion', 'roles', 'editar')
  @Post(':id/permissions')
  @ApiOperation({ summary: 'Asignar permisos al rol' })
  @ApiResponse({ status: 201, description: 'Permisos asignados' })
  assignPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenant_id') tenantId: string,
    @Body() body: AssignRolePermissionsDto,
  ) {
    return this.rolesService.assignPermissions(id, tenantId, body);
  }

  @RequirePermission('configuracion', 'roles', 'editar')
  @Delete(':id/permissions/:permissionId')
  @ApiOperation({ summary: 'Quitar permiso del rol' })
  @ApiResponse({ status: 200, description: 'Permiso removido del rol' })
  removePermission(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('permissionId', ParseUUIDPipe) permissionId: string,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    return this.rolesService.removePermission(id, permissionId, tenantId);
  }

  @RequirePermission('configuracion', 'roles', 'ver')
  @Get(':id/users')
  @ApiOperation({ summary: 'Listar usuarios con este rol' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios' })
  getRoleUsers(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    return this.rolesService.getRoleUsers(id, tenantId);
  }
}
