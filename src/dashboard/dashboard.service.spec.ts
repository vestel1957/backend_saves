import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DashboardService', () => {
  let service: DashboardService;

  const mockPrisma = {
    users: {
      count: jest.fn(),
    },
    roles: {
      count: jest.fn(),
    },
    permissions: {
      count: jest.fn(),
    },
    login_attempts: {
      groupBy: jest.fn(),
    },
    audit_log: {
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getStats', () => {
    it('should return aggregated stats', async () => {
      mockPrisma.users.count
        .mockResolvedValueOnce(100)  // totalUsers
        .mockResolvedValueOnce(80)   // activeUsers
        .mockResolvedValueOnce(20);  // inactiveUsers
      mockPrisma.roles.count.mockResolvedValue(5);
      mockPrisma.permissions.count.mockResolvedValue(30);

      const result = await service.getStats();

      expect(result).toEqual({
        users: { total: 100, active: 80, inactive: 20 },
        roles: 5,
        permissions: 30,
      });

      expect(mockPrisma.users.count).toHaveBeenCalledWith({ where: { deleted_at: null } });
      expect(mockPrisma.users.count).toHaveBeenCalledWith({ where: { deleted_at: null, is_active: true } });
      expect(mockPrisma.users.count).toHaveBeenCalledWith({ where: { deleted_at: null, is_active: false } });
      expect(mockPrisma.roles.count).toHaveBeenCalledWith({ where: { is_active: true } });
      expect(mockPrisma.permissions.count).toHaveBeenCalledWith();
    });
  });

  describe('getLoginActivity', () => {
    it('should return login activity with daily breakdown', async () => {
      mockPrisma.login_attempts.groupBy.mockResolvedValue([
        { success: true, _count: 50 },
        { success: false, _count: 10 },
      ]);
      mockPrisma.$queryRaw.mockResolvedValue([
        { date: new Date('2026-03-15'), successful: BigInt(30), failed: BigInt(5) },
        { date: new Date('2026-03-14'), successful: BigInt(20), failed: BigInt(5) },
      ]);

      const result = await service.getLoginActivity(7);

      expect(result.period_days).toBe(7);
      expect(result.total_successful).toBe(50);
      expect(result.total_failed).toBe(10);
      expect(result.daily).toEqual([
        { date: new Date('2026-03-15'), successful: 30, failed: 5 },
        { date: new Date('2026-03-14'), successful: 20, failed: 5 },
      ]);
    });

    it('should default to 7 days', async () => {
      mockPrisma.login_attempts.groupBy.mockResolvedValue([]);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getLoginActivity();

      expect(result.period_days).toBe(7);
    });

    it('should handle no login attempts', async () => {
      mockPrisma.login_attempts.groupBy.mockResolvedValue([]);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getLoginActivity(7);

      expect(result.total_successful).toBe(0);
      expect(result.total_failed).toBe(0);
      expect(result.daily).toEqual([]);
    });
  });

  describe('getRecentActivity', () => {
    const mockActivities = [
      {
        id: 'a1',
        module: 'users',
        submodule: null,
        action: 'create',
        resource_id: 'u1',
        created_at: new Date(),
        user: { id: 'u1', email: 'admin@test.com', first_name: 'Admin', last_name: 'User' },
      },
    ];

    it('should return recent audit log entries', async () => {
      mockPrisma.audit_log.findMany.mockResolvedValue(mockActivities);

      const result = await service.getRecentActivity(10);

      expect(result).toEqual(mockActivities);
      expect(mockPrisma.audit_log.findMany).toHaveBeenCalledWith({
        take: 10,
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
    });

    it('should cap limit at 50', async () => {
      mockPrisma.audit_log.findMany.mockResolvedValue([]);

      await service.getRecentActivity(100);

      expect(mockPrisma.audit_log.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
    });

    it('should default to 10 items', async () => {
      mockPrisma.audit_log.findMany.mockResolvedValue([]);

      await service.getRecentActivity();

      expect(mockPrisma.audit_log.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 }),
      );
    });
  });

  describe('getNewUsersOverTime', () => {
    it('should return new users over time with bigint conversion', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { date: new Date('2026-03-15'), count: BigInt(5) },
        { date: new Date('2026-03-14'), count: BigInt(3) },
      ]);

      const result = await service.getNewUsersOverTime(30);

      expect(result.period_days).toBe(30);
      expect(result.daily).toEqual([
        { date: new Date('2026-03-15'), count: 5 },
        { date: new Date('2026-03-14'), count: 3 },
      ]);
    });

    it('should default to 30 days', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getNewUsersOverTime();

      expect(result.period_days).toBe(30);
    });
  });
});
