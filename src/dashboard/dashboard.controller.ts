import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtGuard } from '../auth/guards/jwt.guard';

@ApiTags('Dashboard')
@ApiBearerAuth('access-token')
@Controller('api/v1/dashboard')
@UseGuards(JwtGuard)
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Obtener estadisticas generales del sistema' })
  @ApiResponse({ status: 200, description: 'Estadisticas de usuarios, roles y permisos' })
  getStats() {
    return this.dashboardService.getStats();
  }

  @Get('login-activity')
  @ApiOperation({ summary: 'Actividad de login en los ultimos N dias' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Dias a consultar (default 7)' })
  @ApiResponse({ status: 200, description: 'Resumen de logins exitosos y fallidos por dia' })
  getLoginActivity(@Query('days') days?: string) {
    return this.dashboardService.getLoginActivity(days ? parseInt(days) : 7);
  }

  @Get('recent-activity')
  @ApiOperation({ summary: 'Ultimas acciones del audit log' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Cantidad de registros (default 10, max 50)' })
  @ApiResponse({ status: 200, description: 'Lista de actividad reciente' })
  getRecentActivity(@Query('limit') limit?: string) {
    return this.dashboardService.getRecentActivity(limit ? parseInt(limit) : 10);
  }

  @Get('new-users')
  @ApiOperation({ summary: 'Nuevos usuarios en los ultimos N dias' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Dias a consultar (default 30)' })
  @ApiResponse({ status: 200, description: 'Usuarios creados por dia' })
  getNewUsers(@Query('days') days?: string) {
    return this.dashboardService.getNewUsersOverTime(days ? parseInt(days) : 30);
  }
}
