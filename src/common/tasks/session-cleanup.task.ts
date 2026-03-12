import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SessionCleanupTask {
  private readonly logger = new Logger(SessionCleanupTask.name);

  constructor(private prisma: PrismaService) {}

  // Ejecutar todos los días a las 3:00 AM
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCleanup() {
    const now = new Date();

    // Eliminar sesiones expiradas
    const deletedSessions = await this.prisma.user_sessions.deleteMany({
      where: { expires_at: { lt: now } },
    });

    // Eliminar códigos de reset expirados
    const deletedCodes = await this.prisma.password_reset_codes.deleteMany({
      where: { expires_at: { lt: now } },
    });

    if (deletedSessions.count > 0 || deletedCodes.count > 0) {
      this.logger.log(
        `Limpieza completada: ${deletedSessions.count} sesiones y ${deletedCodes.count} códigos de reset eliminados`,
      );
    }
  }
}
