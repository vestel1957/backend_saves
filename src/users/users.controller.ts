import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, UseGuards, UseInterceptors, Req, ForbiddenException,
  UploadedFiles, ParseUUIDPipe,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UploadsService } from '../uploads/uploads.service';
import { AuditService } from '../common/services/audit.service';
import { imageFileFilter, documentFileFilter } from '../common/filters/file-filter';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/user-current.decorator';
import { CreateUserDto, UpdateUserDto, ChangePasswordDto, AssignRolesDto, AssignPermissionsDto } from './dto';
import type { Request } from 'express';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('api/v1/users')
@UseGuards(JwtGuard, PermissionGuard)
export class UsersController {
  constructor(
    private usersService: UsersService,
    private uploadsService: UploadsService,
    private auditService: AuditService,
  ) {}

  private auditCtx(userId: string, tenantId: string, req: Request) {
    return { user_id: userId, tenant_id: tenantId, ip_address: req.ip, user_agent: req.headers['user-agent'] as string };
  }

  // ─── CRUD ───────────────────────────────────────────────

  @RequirePermission('configuracion', 'usuarios', 'ver')
  @Get()
  @ApiOperation({ summary: 'Listar usuarios paginados' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'is_active', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Lista paginada de usuarios' })
  findAll(
    @CurrentUser('tenant_id') tenantId: string,
    @Query() query: { page?: string; limit?: string; search?: string; is_active?: string },
    @Req() req: Request,
  ) {
    return this.usersService.findAll(tenantId, {
      page: query.page ? parseInt(query.page) : undefined,
      limit: query.limit ? parseInt(query.limit) : undefined,
      search: query.search,
      is_active: query.is_active ? query.is_active === 'true' : undefined,
    }).then((result) => ({
      ...result,
      data: result.data.map((user) => this.mapUserFileUrls(user, req)),
    }));
  }

  @RequirePermission('configuracion', 'usuarios', 'ver')
  @Get('catalogs/areas')
  @ApiOperation({ summary: 'Listar áreas disponibles' })
  @ApiResponse({ status: 200, description: 'Lista de áreas' })
  getAreas(@CurrentUser('tenant_id') tenantId: string) {
    return this.usersService.getAreas(tenantId);
  }

  @RequirePermission('configuracion', 'usuarios', 'ver')
  @Get('catalogs/sedes')
  @ApiOperation({ summary: 'Listar sedes disponibles' })
  @ApiResponse({ status: 200, description: 'Lista de sedes' })
  getSedes(@CurrentUser('tenant_id') tenantId: string) {
    return this.usersService.getSedes(tenantId);
  }

  @RequirePermission('configuracion', 'usuarios', 'ver')
  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de un usuario' })
  @ApiResponse({ status: 200, description: 'Detalle del usuario con roles y permisos' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenant_id') tenantId: string,
    @Req() req: Request,
  ) {
    return this.usersService.findOne(id, tenantId)
      .then((user) => this.mapUserFileUrls(user, req));
  }

  @RequirePermission('configuracion', 'usuarios', 'crear')
  @Post()
  @ApiOperation({ summary: 'Crear usuario con archivos opcionales' })
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiResponse({ status: 201, description: 'Usuario creado' })
  @ApiResponse({ status: 409, description: 'Email o username ya existe' })
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'avatar', maxCount: 1 },
    { name: 'signature', maxCount: 1 },
    { name: 'documents', maxCount: 10 },
  ], {
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (file.fieldname === 'avatar' || file.fieldname === 'signature') {
        return imageFileFilter(req, file, cb);
      }
      return documentFileFilter(req, file, cb);
    },
  }))
  async create(
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() body: CreateUserDto,
    @Req() req: Request,
    @UploadedFiles() files: {
      avatar?: Express.Multer.File[];
      signature?: Express.Multer.File[];
      documents?: Express.Multer.File[];
    },
  ) {
    let avatar_url: string | undefined;
    let signature_url: string | undefined;
    let document_urls: string[] = [];

    if (files?.avatar?.[0]) {
      avatar_url = this.uploadsService.saveFile(files.avatar[0], 'avatars');
    }
    if (files?.signature?.[0]) {
      signature_url = this.uploadsService.saveFile(files.signature[0], 'signatures');
    }
    if (files?.documents?.length) {
      document_urls = this.uploadsService.saveFiles(files.documents, 'documents');
    }

    const createdUser = await this.usersService.create(tenantId, {
      ...body,
      avatar_url,
      signature_url,
      document_urls,
    }, userId);

    this.auditService.log({
      context: this.auditCtx(userId, tenantId, req),
      module: 'configuracion', submodule: 'usuarios', action: 'crear',
      resource_id: createdUser.id,
      new_data: { email: createdUser.email, username: createdUser.username },
    });

    return this.mapUserFileUrls(createdUser, req);
  }

  @RequirePermission('configuracion', 'usuarios', 'editar')
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar usuario con archivos opcionales' })
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiResponse({ status: 200, description: 'Usuario actualizado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'avatar', maxCount: 1 },
    { name: 'signature', maxCount: 1 },
    { name: 'documents', maxCount: 10 },
  ], {
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (file.fieldname === 'avatar' || file.fieldname === 'signature') {
        return imageFileFilter(req, file, cb);
      }
      return documentFileFilter(req, file, cb);
    },
  }))
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() body: UpdateUserDto,
    @Req() req: Request,
    @UploadedFiles() files: {
      avatar?: Express.Multer.File[];
      signature?: Express.Multer.File[];
      documents?: Express.Multer.File[];
    },
  ) {
    let avatar_url: string | undefined;
    let signature_url: string | undefined;
    let document_urls: string[] = [];

    if (files?.avatar?.[0]) {
      avatar_url = this.uploadsService.saveFile(files.avatar[0], 'avatars');
    }
    if (files?.signature?.[0]) {
      signature_url = this.uploadsService.saveFile(files.signature[0], 'signatures');
    }
    if (files?.documents?.length) {
      document_urls = this.uploadsService.saveFiles(files.documents, 'documents');
    }

    const parsedBody: any = {
      ...body,
      is_active: body.is_active !== undefined ? body.is_active === 'true' : undefined,
    };

    if (avatar_url) parsedBody.avatar_url = avatar_url;
    if (signature_url) parsedBody.signature_url = signature_url;
    if (document_urls.length) parsedBody.document_urls = document_urls;

    const updatedUser = await this.usersService.update(id, tenantId, parsedBody, userId);

    this.auditService.log({
      context: this.auditCtx(userId, tenantId, req),
      module: 'configuracion', submodule: 'usuarios', action: 'editar',
      resource_id: id,
      new_data: parsedBody,
    });

    return this.mapUserFileUrls(updatedUser, req);
  }

  @RequirePermission('configuracion', 'usuarios', 'eliminar')
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar usuario' })
  @ApiResponse({ status: 200, description: 'Usuario eliminado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') userId: string,
    @Req() req: Request,
  ) {
    const result = await this.usersService.remove(id, tenantId);

    this.auditService.log({
      context: this.auditCtx(userId, tenantId, req),
      module: 'configuracion', submodule: 'usuarios', action: 'eliminar',
      resource_id: id,
    });

    return result;
  }

  // ─── ACCIONES ESPECIALES ────────────────────────────────

  @RequirePermission('configuracion', 'usuarios', 'editar')
  @Patch(':id/password')
  @ApiOperation({ summary: 'Cambiar contraseña de un usuario' })
  @ApiResponse({ status: 200, description: 'Contraseña actualizada' })
  async changePassword(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() body: ChangePasswordDto,
    @Req() req: Request,
  ) {
    const result = await this.usersService.changePassword(id, tenantId, body, userId);

    this.auditService.log({
      context: this.auditCtx(userId, tenantId, req),
      module: 'configuracion', submodule: 'usuarios', action: 'cambiar_password',
      resource_id: id,
    });

    return result;
  }

  @Patch(':id/password/admin-reset')
  @ApiOperation({ summary: 'Resetear contraseña de un usuario directamente (solo super admin)' })
  @ApiResponse({ status: 200, description: 'Contraseña actualizada por super admin' })
  @ApiResponse({ status: 403, description: 'Solo disponible para super admin' })
  async adminResetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('is_super_admin') isSuperAdmin: boolean,
    @Body() body: ChangePasswordDto,
    @Req() req: Request,
  ) {
    if (!isSuperAdmin) {
      throw new ForbiddenException('Solo el super admin puede resetear contraseñas directamente');
    }

    const result = await this.usersService.changePassword(id, tenantId, body, userId);

    this.auditService.log({
      context: this.auditCtx(userId, tenantId, req),
      module: 'configuracion', submodule: 'usuarios', action: 'admin_reset_password',
      resource_id: id,
    });

    return result;
  }

  @RequirePermission('configuracion', 'usuarios', 'editar')
  @Patch(':id/toggle-status')
  @ApiOperation({ summary: 'Activar/desactivar usuario' })
  @ApiResponse({ status: 200, description: 'Estado cambiado' })
  async toggleStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') userId: string,
    @Req() req: Request,
  ) {
    const result = await this.usersService.toggleStatus(id, tenantId);

    this.auditService.log({
      context: this.auditCtx(userId, tenantId, req),
      module: 'configuracion', submodule: 'usuarios', action: 'toggle_status',
      resource_id: id,
      new_data: { is_active: result.is_active },
    });

    return result;
  }

  // ─── ROLES ──────────────────────────────────────────────

  @RequirePermission('configuracion', 'usuarios', 'ver')
  @Get(':id/roles')
  @ApiOperation({ summary: 'Obtener roles del usuario' })
  @ApiResponse({ status: 200, description: 'Lista de roles asignados' })
  getUserRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    return this.usersService.getUserRoles(id, tenantId);
  }

  @RequirePermission('configuracion', 'usuarios', 'editar')
  @Post(':id/roles')
  @ApiOperation({ summary: 'Asignar roles a un usuario' })
  @ApiResponse({ status: 201, description: 'Roles asignados' })
  async assignRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() body: AssignRolesDto,
    @Req() req: Request,
  ) {
    const result = await this.usersService.assignRoles(id, tenantId, body, userId);

    this.auditService.log({
      context: this.auditCtx(userId, tenantId, req),
      module: 'configuracion', submodule: 'usuarios', action: 'asignar_roles',
      resource_id: id,
      new_data: { role_ids: body.role_ids },
    });

    return result;
  }

  @RequirePermission('configuracion', 'usuarios', 'editar')
  @Delete(':id/roles/:roleId')
  @ApiOperation({ summary: 'Quitar rol de un usuario' })
  @ApiResponse({ status: 200, description: 'Rol removido' })
  async removeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') userId: string,
    @Req() req: Request,
  ) {
    const result = await this.usersService.removeRole(id, roleId, tenantId);

    this.auditService.log({
      context: this.auditCtx(userId, tenantId, req),
      module: 'configuracion', submodule: 'usuarios', action: 'remover_rol',
      resource_id: id,
      old_data: { role_id: roleId },
    });

    return result;
  }

  // ─── PERMISOS ───────────────────────────────────────────

  @RequirePermission('configuracion', 'usuarios', 'ver')
  @Get(':id/permissions')
  @ApiOperation({ summary: 'Obtener permisos combinados del usuario (roles + extra)' })
  @ApiResponse({ status: 200, description: 'Lista de permisos' })
  getUserPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    return this.usersService.getUserPermissions(id, tenantId);
  }

  @RequirePermission('configuracion', 'usuarios', 'editar')
  @Post(':id/permissions')
  @ApiOperation({ summary: 'Agregar permisos extra al usuario' })
  @ApiResponse({ status: 201, description: 'Permisos extra asignados' })
  async assignExtraPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() body: AssignPermissionsDto,
    @Req() req: Request,
  ) {
    const result = await this.usersService.assignExtraPermissions(id, tenantId, body, userId);

    this.auditService.log({
      context: this.auditCtx(userId, tenantId, req),
      module: 'configuracion', submodule: 'usuarios', action: 'asignar_permisos',
      resource_id: id,
      new_data: { permission_ids: body.permission_ids },
    });

    return result;
  }

  @RequirePermission('configuracion', 'usuarios', 'editar')
  @Put(':id/permissions')
  @ApiOperation({ summary: 'Reemplazar todos los permisos extra del usuario' })
  @ApiResponse({ status: 200, description: 'Permisos extra actualizados' })
  async replaceExtraPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() body: AssignPermissionsDto,
    @Req() req: Request,
  ) {
    const result = await this.usersService.replaceExtraPermissions(id, tenantId, body, userId);

    this.auditService.log({
      context: this.auditCtx(userId, tenantId, req),
      module: 'configuracion', submodule: 'usuarios', action: 'reemplazar_permisos',
      resource_id: id,
      new_data: { permission_ids: body.permission_ids },
    });

    return result;
  }

  @RequirePermission('configuracion', 'usuarios', 'editar')
  @Delete(':id/permissions/:permissionId')
  @ApiOperation({ summary: 'Quitar permiso extra del usuario' })
  @ApiResponse({ status: 200, description: 'Permiso extra removido' })
  async removeExtraPermission(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('permissionId', ParseUUIDPipe) permissionId: string,
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') userId: string,
    @Req() req: Request,
  ) {
    const result = await this.usersService.removeExtraPermission(id, permissionId, tenantId);

    this.auditService.log({
      context: this.auditCtx(userId, tenantId, req),
      module: 'configuracion', submodule: 'usuarios', action: 'remover_permiso',
      resource_id: id,
      old_data: { permission_id: permissionId },
    });

    return result;
  }

  private mapUserFileUrls<T extends Record<string, any>>(user: T, req: Request): T {
    return {
      ...user,
      avatar_url: this.toAbsoluteUrl(user.avatar_url, req),
      signature_url: this.toAbsoluteUrl(user.signature_url, req),
      document_urls: Array.isArray(user.document_urls)
        ? user.document_urls.map((url: string) => this.toAbsoluteUrl(url, req))
        : user.document_urls,
    };
  }

  private toAbsoluteUrl(filePath?: string | null, req?: Request): string | null | undefined {
    if (!filePath) return filePath;
    if (/^https?:\/\//i.test(filePath)) return filePath;

    const configuredBaseUrl = process.env.PUBLIC_BASE_URL?.trim();
    const baseUrl = configuredBaseUrl
      ? configuredBaseUrl.replace(/\/+$/, '')
      : this.getRequestBaseUrl(req);

    const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
    return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
  }

  private getRequestBaseUrl(req?: Request): string | undefined {
    if (!req) return undefined;

    const forwardedProto = req.headers['x-forwarded-proto'];
    const forwardedHost = req.headers['x-forwarded-host'];
    const protocol = typeof forwardedProto === 'string' ? forwardedProto : req.protocol;
    const host = typeof forwardedHost === 'string' ? forwardedHost : req.get('host');

    if (!host) return undefined;
    return `${protocol}://${host}`.replace(/\/+$/, '');
  }
}
