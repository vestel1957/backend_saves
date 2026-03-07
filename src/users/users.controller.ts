import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/user-current.decorator';

@Controller('api/v1/users')
@UseGuards(JwtGuard, PermissionGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  // GET /api/v1/users?page=1&limit=10&search=juan
  @RequirePermission('configuracion', 'usuarios', 'ver')
  @Get()
  findAll(
    @CurrentUser('tenant_id') tenantId: string,
    @Query() query: { page?: string; limit?: string; search?: string; is_active?: string },
  ) {
    return this.usersService.findAll(tenantId, {
      page: query.page ? parseInt(query.page) : undefined,
      limit: query.limit ? parseInt(query.limit) : undefined,
      search: query.search,
      is_active: query.is_active ? query.is_active === 'true' : undefined,
    });
  }

  // GET /api/v1/users/:id
  @RequirePermission('configuracion', 'usuarios', 'ver')
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    return this.usersService.findOne(id, tenantId);
  }

  // POST /api/v1/users
  @RequirePermission('configuracion', 'usuarios', 'crear')
  @Post()
  create(
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() body: {
      email: string;
      username: string;
      password: string;
      first_name?: string;
      last_name?: string;
      role_ids?: string[];
      extra_permission_ids?: string[];
    },
  ) {
    return this.usersService.create(tenantId, body, userId);
  }

  // PATCH /api/v1/users/:id
  @RequirePermission('configuracion', 'usuarios', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() body: {
      first_name?: string;
      last_name?: string;
      avatar_url?: string;
      is_active?: boolean;
      role_ids?: string[];
      extra_permission_ids?: string[];
    },
  ) {
    return this.usersService.update(id, tenantId, body, userId);
  }

  // DELETE /api/v1/users/:id
  @RequirePermission('configuracion', 'usuarios', 'eliminar')
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    return this.usersService.remove(id, tenantId);
  }

  // ─── ROLES ──────────────────────────────────────────────

  // GET /api/v1/users/:id/roles
  @RequirePermission('configuracion', 'usuarios', 'ver')
  @Get(':id/roles')
  getUserRoles(
    @Param('id') id: string,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    return this.usersService.getUserRoles(id, tenantId);
  }

  // POST /api/v1/users/:id/roles
  @RequirePermission('configuracion', 'usuarios', 'editar')
  @Post(':id/roles')
  assignRoles(
    @Param('id') id: string,
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { role_ids: string[]; expires_at?: string },
  ) {
    return this.usersService.assignRoles(id, tenantId, body, userId);
  }

  // DELETE /api/v1/users/:id/roles/:roleId
  @RequirePermission('configuracion', 'usuarios', 'editar')
  @Delete(':id/roles/:roleId')
  removeRole(
    @Param('id') id: string,
    @Param('roleId') roleId: string,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    return this.usersService.removeRole(id, roleId, tenantId);
  }

  // ─── PERMISOS ───────────────────────────────────────────

  // GET /api/v1/users/:id/permissions
  // Retorna permisos combinados (rol + extra) con source indicator
  @RequirePermission('configuracion', 'usuarios', 'ver')
  @Get(':id/permissions')
  getUserPermissions(
    @Param('id') id: string,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    return this.usersService.getUserPermissions(id, tenantId);
  }

  // POST /api/v1/users/:id/permissions
  // Agrega permisos extra individuales
  @RequirePermission('configuracion', 'usuarios', 'editar')
  @Post(':id/permissions')
  assignExtraPermissions(
    @Param('id') id: string,
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { permission_ids: string[] },
  ) {
    return this.usersService.assignExtraPermissions(id, tenantId, body, userId);
  }

  // PUT /api/v1/users/:id/permissions
  // Reemplaza todos los permisos extra
  @RequirePermission('configuracion', 'usuarios', 'editar')
  @Put(':id/permissions')
  replaceExtraPermissions(
    @Param('id') id: string,
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { permission_ids: string[] },
  ) {
    return this.usersService.replaceExtraPermissions(id, tenantId, body, userId);
  }

  // DELETE /api/v1/users/:id/permissions/:permissionId
  // Quita un permiso extra específico
  @RequirePermission('configuracion', 'usuarios', 'editar')
  @Delete(':id/permissions/:permissionId')
  removeExtraPermission(
    @Param('id') id: string,
    @Param('permissionId') permissionId: string,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    return this.usersService.removeExtraPermission(id, permissionId, tenantId);
  }
}