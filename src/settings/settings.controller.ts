import { Controller, Get, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { AuditService } from '../common/services/audit.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/user-current.decorator';
import { UpsertSettingDto, UpsertBulkSettingsDto } from './dto';
import type { Request } from 'express';

@ApiTags('Settings')
@ApiBearerAuth('access-token')
@Controller('api/v1/settings')
@UseGuards(JwtGuard, PermissionGuard)
export class SettingsController {
  constructor(
    private settingsService: SettingsService,
    private auditService: AuditService,
  ) {}

  private auditCtx(userId: string, req: Request) {
    return { user_id: userId, ip_address: req.ip, user_agent: req.headers['user-agent'] as string };
  }

  @RequirePermission('sistema', 'configuracion', 'ver')
  @Get()
  @ApiOperation({ summary: 'Obtener todos los settings agrupados' })
  @ApiQuery({ name: 'group', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Settings agrupados' })
  findAll(@Query('group') group?: string) {
    return this.settingsService.findAll(group);
  }

  @RequirePermission('sistema', 'configuracion', 'ver')
  @Get(':key')
  @ApiOperation({ summary: 'Obtener un setting por key' })
  @ApiResponse({ status: 200, description: 'Setting encontrado' })
  @ApiResponse({ status: 404, description: 'Setting no encontrado' })
  findByKey(@Param('key') key: string) {
    return this.settingsService.findByKey(key);
  }

  @RequirePermission('sistema', 'configuracion', 'editar')
  @Put()
  @ApiOperation({ summary: 'Crear o actualizar un setting' })
  @ApiResponse({ status: 200, description: 'Setting actualizado' })
  async upsert(
    @CurrentUser('id') userId: string,
    @Body() body: UpsertSettingDto,
    @Req() req: Request,
  ) {
    const result = await this.settingsService.upsert(body.key, body);

    this.auditService.log({
      context: this.auditCtx(userId, req),
      module: 'sistema', submodule: 'configuracion', action: 'editar',
      new_data: { key: body.key, value: body.value },
    });

    return result;
  }

  @RequirePermission('sistema', 'configuracion', 'editar')
  @Put('bulk')
  @ApiOperation({ summary: 'Crear o actualizar multiples settings' })
  @ApiResponse({ status: 200, description: 'Settings actualizados' })
  async upsertBulk(
    @CurrentUser('id') userId: string,
    @Body() body: UpsertBulkSettingsDto,
    @Req() req: Request,
  ) {
    const result = await this.settingsService.upsertBulk(body.settings);

    this.auditService.log({
      context: this.auditCtx(userId, req),
      module: 'sistema', submodule: 'configuracion', action: 'editar_masivo',
      new_data: { count: body.settings.length },
    });

    return result;
  }

  @RequirePermission('sistema', 'configuracion', 'editar')
  @Delete(':key')
  @ApiOperation({ summary: 'Eliminar un setting' })
  @ApiResponse({ status: 200, description: 'Setting eliminado' })
  async remove(
    @Param('key') key: string,
    @CurrentUser('id') userId: string,
    @Req() req: Request,
  ) {
    const result = await this.settingsService.remove(key);

    this.auditService.log({
      context: this.auditCtx(userId, req),
      module: 'sistema', submodule: 'configuracion', action: 'eliminar',
      new_data: { key },
    });

    return result;
  }
}
