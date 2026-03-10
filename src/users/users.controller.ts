import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, UseGuards, UseInterceptors,
  UploadedFiles, ParseUUIDPipe,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UploadsService } from '../uploads/uploads.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/user-current.decorator';
import { CreateUserDto, UpdateUserDto, ChangePasswordDto, AssignRolesDto, AssignPermissionsDto } from './dto';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('api/v1/users')
@UseGuards(JwtGuard, PermissionGuard)
export class UsersController {
  constructor(
    private usersService: UsersService,
    private uploadsService: UploadsService,
  ) {}

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
  ) {
    return this.usersService.findAll(tenantId, {
      page: query.page ? parseInt(query.page) : undefined,
      limit: query.limit ? parseInt(query.limit) : undefined,
      search: query.search,
      is_active: query.is_active ? query.is_active === 'true' : undefined,
    });
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
  ) {
    return this.usersService.findOne(id, tenantId);
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
  }))
  async create(
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() body: CreateUserDto,
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

    return this.usersService.create(tenantId, {
      ...body,
      avatar_url,
      signature_url,
      document_urls,
    }, userId);
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
  }))
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() body: UpdateUserDto,
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

    return this.usersService.update(id, tenantId, parsedBody, userId);
  }

  @RequirePermission('configuracion', 'usuarios', 'eliminar')
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar usuario' })
  @ApiResponse({ status: 200, description: 'Usuario eliminado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    return this.usersService.remove(id, tenantId);
  }

  // ─── ACCIONES ESPECIALES ────────────────────────────────

  @RequirePermission('configuracion', 'usuarios', 'editar')
  @Patch(':id/password')
  @ApiOperation({ summary: 'Cambiar contraseña de un usuario' })
  @ApiResponse({ status: 200, description: 'Contraseña actualizada' })
  changePassword(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() body: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(id, tenantId, body, userId);
  }

  @RequirePermission('configuracion', 'usuarios', 'editar')
  @Patch(':id/toggle-status')
  @ApiOperation({ summary: 'Activar/desactivar usuario' })
  @ApiResponse({ status: 200, description: 'Estado cambiado' })
  toggleStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    return this.usersService.toggleStatus(id, tenantId);
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
  assignRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() body: AssignRolesDto,
  ) {
    return this.usersService.assignRoles(id, tenantId, body, userId);
  }

  @RequirePermission('configuracion', 'usuarios', 'editar')
  @Delete(':id/roles/:roleId')
  @ApiOperation({ summary: 'Quitar rol de un usuario' })
  @ApiResponse({ status: 200, description: 'Rol removido' })
  removeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    return this.usersService.removeRole(id, roleId, tenantId);
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
  assignExtraPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() body: AssignPermissionsDto,
  ) {
    return this.usersService.assignExtraPermissions(id, tenantId, body, userId);
  }

  @RequirePermission('configuracion', 'usuarios', 'editar')
  @Put(':id/permissions')
  @ApiOperation({ summary: 'Reemplazar todos los permisos extra del usuario' })
  @ApiResponse({ status: 200, description: 'Permisos extra actualizados' })
  replaceExtraPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() body: AssignPermissionsDto,
  ) {
    return this.usersService.replaceExtraPermissions(id, tenantId, body, userId);
  }

  @RequirePermission('configuracion', 'usuarios', 'editar')
  @Delete(':id/permissions/:permissionId')
  @ApiOperation({ summary: 'Quitar permiso extra del usuario' })
  @ApiResponse({ status: 200, description: 'Permiso extra removido' })
  removeExtraPermission(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('permissionId', ParseUUIDPipe) permissionId: string,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    return this.usersService.removeExtraPermission(id, permissionId, tenantId);
  }
}
