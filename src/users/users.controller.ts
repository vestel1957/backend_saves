import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, UseGuards, UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { UploadsService } from '../uploads/uploads.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/user-current.decorator';

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
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    return this.usersService.findOne(id, tenantId);
  }

  // POST /api/v1/users (multipart/form-data con archivos)
  @RequirePermission('configuracion', 'usuarios', 'crear')
  @Post()
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
    @Body() body: any,
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

  // PATCH /api/v1/users/:id (multipart/form-data con archivos)
  @RequirePermission('configuracion', 'usuarios', 'editar')
  @Patch(':id')
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'avatar', maxCount: 1 },
    { name: 'signature', maxCount: 1 },
    { name: 'documents', maxCount: 10 },
  ], {
    limits: { fileSize: 5 * 1024 * 1024 },
  }))
  async update(
    @Param('id') id: string,
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() body: any,
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

    const parsedBody = {
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
  remove(
    @Param('id') id: string,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    return this.usersService.remove(id, tenantId);
  }

  // ─── ACCIONES ESPECIALES ────────────────────────────────

  @RequirePermission('configuracion', 'usuarios', 'editar')
  @Patch(':id/password')
  changePassword(
    @Param('id') id: string,
    @CurrentUser('tenant_id') tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { new_password: string },
  ) {
    return this.usersService.changePassword(id, tenantId, body, userId);
  }

  @RequirePermission('configuracion', 'usuarios', 'editar')
  @Patch(':id/toggle-status')
  toggleStatus(
    @Param('id') id: string,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    return this.usersService.toggleStatus(id, tenantId);
  }

  // ─── ROLES ──────────────────────────────────────────────

  @RequirePermission('configuracion', 'usuarios', 'ver')
  @Get(':id/roles')
  getUserRoles(
    @Param('id') id: string,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    return this.usersService.getUserRoles(id, tenantId);
  }

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

  @RequirePermission('configuracion', 'usuarios', 'ver')
  @Get(':id/permissions')
  getUserPermissions(
    @Param('id') id: string,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    return this.usersService.getUserPermissions(id, tenantId);
  }

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

  @RequirePermission('configuracion', 'usuarios', 'editar')
  @Delete(':id/permissions/:permissionId')
  removeExtraPermission(
    @Param('id') id: string,
    @Param('permissionId') permissionId: string,
    @CurrentUser('tenant_id') tenantId: string,
  ) {
    return this.usersService.removeExtraPermission(id, permissionId, tenantId);
  }

  // ─── CATÁLOGOS ──────────────────────────────────────────

  @RequirePermission('configuracion', 'usuarios', 'ver')
  @Get('catalogs/areas')
  getAreas(@CurrentUser('tenant_id') tenantId: string) {
    return this.usersService.getAreas(tenantId);
  }

  @RequirePermission('configuracion', 'usuarios', 'ver')
  @Get('catalogs/sedes')
  getSedes(@CurrentUser('tenant_id') tenantId: string) {
    return this.usersService.getSedes(tenantId);
  }
}