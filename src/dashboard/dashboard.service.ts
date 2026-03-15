import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats() {
    const [
      totalUsers,
      activeUsers,
      inactiveUsers,
      totalRoles,
      totalPermissions,
    ] = await Promise.all([
      this.prisma.users.count({ where: { deleted_at: null } }),
      this.prisma.users.count({ where: { deleted_at: null, is_active: true } }),
      this.prisma.users.count({ where: { deleted_at: null, is_active: false } }),
      this.prisma.roles.count({ where: { is_active: true } }),
      this.prisma.permissions.count(),
    ]);

    return {
      users: { total: totalUsers, active: activeUsers, inactive: inactiveUsers },
      roles: totalRoles,
      permissions: totalPermissions,
    };
  }

  async getLoginActivity(days: number = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const attempts = await this.prisma.login_attempts.groupBy({
      by: ['success'],
      where: { created_at: { gte: since } },
      _count: true,
    });

    const successful = attempts.find((a) => a.success)?._count || 0;
    const failed = attempts.find((a) => !a.success)?._count || 0;

    // Daily breakdown
    const daily = await this.prisma.$queryRaw`
      SELECT
        DATE(created_at) as date,
        COUNT(*) FILTER (WHERE success = true) as successful,
        COUNT(*) FILTER (WHERE success = false) as failed
      FROM login_attempts
      WHERE created_at >= ${since}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    ` as { date: Date; successful: bigint; failed: bigint }[];

    return {
      period_days: days,
      total_successful: successful,
      total_failed: failed,
      daily: daily.map((d) => ({
        date: d.date,
        successful: Number(d.successful),
        failed: Number(d.failed),
      })),
    };
  }

  async getRecentActivity(limit: number = 10) {
    return this.prisma.audit_log.findMany({
      take: Math.min(limit, 50),
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        module: true,
        submodule: true,
        action: true,
        resource_id: true,
        created_at: true,
        user: {
          select: { id: true, email: true, first_name: true, last_name: true },
        },
      },
    });
  }

  async getNewUsersOverTime(days: number = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const daily = await this.prisma.$queryRaw`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as count
      FROM users
      WHERE created_at >= ${since} AND deleted_at IS NULL
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    ` as { date: Date; count: bigint }[];

    return {
      period_days: days,
      daily: daily.map((d) => ({
        date: d.date,
        count: Number(d.count),
      })),
    };
  }
}
