import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, ParseUUIDPipe, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { AuditService } from '../common/services/audit.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/user-current.decorator';
import { CreateRoleDto, UpdateRoleDto, AssignRolePermissionsDto } from './dto';
import type { Request } from 'express';

@ApiTags('Roles')
@ApiBearerAuth('access-token')
@Controller('api/v1/roles')
@UseGuards(JwtGuard, PermissionGuard)
export class RolesController {
  constructor(
    private rolesService: RolesService,
    private auditService: AuditService,
  ) {}

  private auditCtx(userId: string, req: Request) {
    return { user_id: userId, ip_address: req.ip, user_agent: req.headers['user-agent'] as string };
  }

  @RequirePermission('configuracion', 'roles', 'ver')
  @Get()
  @ApiOperation({ summary: 'Listar roles' })
  @ApiQuery({ name: 'is_active', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Lista de roles con contadores' })
  findAll(@Query() query: { is_active?: string }) {
    return this.rolesService.findAll({
      is_active: query.is_active ? query.is_active === 'true' : undefined,
    });
  }

  @RequirePermission('configuracion', 'roles', 'ver')
  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de un rol' })
  @ApiResponse({ status: 200, description: 'Detalle del rol con permisos' })
  @ApiResponse({ status: 404, description: 'Rol no encontrado' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.findOne(id);
  }

  @RequirePermission('configuracion', 'roles', 'crear')
  @Post()
  @ApiOperation({ summary: 'Crear rol con permisos opcionales' })
  @ApiResponse({ status: 201, description: 'Rol creado' })
  @ApiResponse({ status: 409, description: 'Ya existe un rol con ese nombre' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() body: CreateRoleDto,
    @Req() req: Request,
  ) {
    const result = await this.rolesService.create(body);

    this.auditService.log({
      context: this.auditCtx(userId, req),
      module: 'configuracion', submodule: 'roles', action: 'crear',
      resource_id: result.id,
      new_data: { name: result.name },
    });

    return result;
  }

  @RequirePermission('configuracion', 'roles', 'editar')
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar rol' })
  @ApiResponse({ status: 200, description: 'Rol actualizado' })
  @ApiResponse({ status: 403, description: 'No se puede modificar rol del sistema' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() body: UpdateRoleDto,
    @Req() req: Request,
  ) {
    const result = await this.rolesService.update(id, body);

    this.auditService.log({
      context: this.auditCtx(userId, req),
      module: 'configuracion', submodule: 'roles', action: 'editar',
      resource_id: id,
      new_data: body,
    });

    return result;
  }

  @RequirePermission('configuracion', 'roles', 'eliminar')
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar rol' })
  @ApiResponse({ status: 200, description: 'Rol eliminado' })
  @ApiResponse({ status: 403, description: 'No se puede eliminar rol del sistema' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @Req() req: Request,
  ) {
    const result = await this.rolesService.remove(id);

    this.auditService.log({
      context: this.auditCtx(userId, req),
      module: 'configuracion', submodule: 'roles', action: 'eliminar',
      resource_id: id,
    });

    return result;
  }

  @RequirePermission('configuracion', 'roles', 'ver')
  @Get(':id/permissions')
  @ApiOperation({ summary: 'Obtener permisos del rol' })
  @ApiResponse({ status: 200, description: 'Lista de permisos asignados' })
  getRolePermissions(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.getRolePermissions(id);
  }

  @RequirePermission('configuracion', 'roles', 'editar')
  @Post(':id/permissions')
  @ApiOperation({ summary: 'Asignar permisos al rol' })
  @ApiResponse({ status: 201, description: 'Permisos asignados' })
  async assignPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() body: AssignRolePermissionsDto,
    @Req() req: Request,
  ) {
    const result = await this.rolesService.assignPermissions(id, body);

    this.auditService.log({
      context: this.auditCtx(userId, req),
      module: 'configuracion', submodule: 'roles', action: 'asignar_permisos',
      resource_id: id,
      new_data: { permission_ids: body.permission_ids },
    });

    return result;
  }

  @RequirePermission('configuracion', 'roles', 'editar')
  @Delete(':id/permissions/:permissionId')
  @ApiOperation({ summary: 'Quitar permiso del rol' })
  @ApiResponse({ status: 200, description: 'Permiso removido del rol' })
  async removePermission(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('permissionId', ParseUUIDPipe) permissionId: string,
    @CurrentUser('id') userId: string,
    @Req() req: Request,
  ) {
    const result = await this.rolesService.removePermission(id, permissionId);

    this.auditService.log({
      context: this.auditCtx(userId, req),
      module: 'configuracion', submodule: 'roles', action: 'remover_permiso',
      resource_id: id,
      old_data: { permission_id: permissionId },
    });

    return result;
  }

  @RequirePermission('configuracion', 'roles', 'ver')
  @Get(':id/users')
  @ApiOperation({ summary: 'Listar usuarios con este rol' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios' })
  getRoleUsers(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.getRoleUsers(id);
  }
}
