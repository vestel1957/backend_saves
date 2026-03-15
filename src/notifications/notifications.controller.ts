import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Sse, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Observable, filter, map } from 'rxjs';
import { NotificationsService } from './notifications.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/user-current.decorator';
import { CreateNotificationDto } from './dto';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller('api/v1/notifications')
@UseGuards(JwtGuard)
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar notificaciones del usuario autenticado' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'unread_only', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Lista paginada de notificaciones' })
  findAll(
    @CurrentUser('id') userId: string,
    @Query() query: { page?: string; limit?: string; unread_only?: string },
  ) {
    return this.notificationsService.findAll(userId, {
      page: query.page ? parseInt(query.page) : undefined,
      limit: query.limit ? parseInt(query.limit) : undefined,
      unread_only: query.unread_only === 'true',
    });
  }

  @Sse('stream')
  @ApiOperation({ summary: 'Stream de notificaciones en tiempo real (SSE)' })
  stream(@CurrentUser('id') userId: string): Observable<MessageEvent> {
    return this.notificationsService.getEventStream().pipe(
      filter((event) => event.user_id === userId),
      map((event) => ({ data: event.data } as MessageEvent)),
    );
  }

  @UseGuards(PermissionGuard)
  @RequirePermission('sistema', 'notificaciones', 'crear')
  @Post()
  @ApiOperation({ summary: 'Crear notificacion para un usuario (admin)' })
  @ApiResponse({ status: 201, description: 'Notificacion creada y enviada' })
  create(@Body() body: CreateNotificationDto) {
    return this.notificationsService.create(body);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marcar notificacion como leida' })
  @ApiResponse({ status: 200, description: 'Notificacion marcada como leida' })
  markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.notificationsService.markAsRead(id, userId);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Marcar todas las notificaciones como leidas' })
  @ApiResponse({ status: 200, description: 'Todas marcadas como leidas' })
  markAllAsRead(@CurrentUser('id') userId: string) {
    return this.notificationsService.markAllAsRead(userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una notificacion' })
  @ApiResponse({ status: 200, description: 'Notificacion eliminada' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.notificationsService.remove(id, userId);
  }
}
