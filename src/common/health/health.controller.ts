import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('Health')
@Controller('api/health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Health check del servicio' })
  @ApiResponse({ status: 200, description: 'Servicio saludable' })
  @ApiResponse({ status: 503, description: 'Servicio no disponible' })
  async check(@Res() res: Response) {
    let database = 'disconnected';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'connected';
    } catch {
      // DB no disponible
    }

    const status = database === 'connected' ? 'ok' : 'degraded';
    const httpStatus = database === 'connected'
      ? HttpStatus.OK
      : HttpStatus.SERVICE_UNAVAILABLE;

    res.status(httpStatus).json({
      status,
      database,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  }
}
