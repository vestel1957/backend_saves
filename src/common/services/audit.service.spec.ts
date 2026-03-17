import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { PrismaService } from '../../prisma/prisma.service';

// Mock the paginate helper
jest.mock('../helpers/paginate', () => ({
  paginate: jest.fn(),
}));

import { paginate } from '../helpers/paginate';

const mockPaginate = paginate as jest.MockedFunction<typeof paginate>;

describe('AuditService', () => {
  let service: AuditService;

  const mockPrisma = {
    audit_log: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('log', () => {
    const baseParams = {
      context: {
        user_id: 'user-1',
        ip_address: '127.0.0.1',
        user_agent: 'Mozilla/5.0',
      },
      module: 'users',
      action: 'create',
    };

    it('should create an audit log entry', async () => {
      mockPrisma.audit_log.create.mockResolvedValue({ id: 'log-1' });

      await service.log(baseParams);

      expect(mockPrisma.audit_log.create).toHaveBeenCalledWith({
        data: {
          user_id: 'user-1',
          module: 'users',
          submodule: null,
          action: 'create',
          resource_id: null,
          old_data: undefined,
          new_data: undefined,
          ip_address: '127.0.0.1',
          user_agent: 'Mozilla/5.0',
        },
      });
    });

    it('should include optional fields when provided', async () => {
      mockPrisma.audit_log.create.mockResolvedValue({ id: 'log-1' });

      await service.log({
        ...baseParams,
        submodule: 'profile',
        resource_id: 'res-1',
        old_data: { name: 'old' },
        new_data: { name: 'new' },
      });

      expect(mockPrisma.audit_log.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          submodule: 'profile',
          resource_id: 'res-1',
          old_data: { name: 'old' },
          new_data: { name: 'new' },
        }),
      });
    });

    it('should catch errors silently without throwing', async () => {
      mockPrisma.audit_log.create.mockRejectedValue(new Error('DB error'));

      // Should not throw
      await expect(service.log(baseParams)).resolves.toBeUndefined();
    });

    it('should handle missing ip_address and user_agent', async () => {
      mockPrisma.audit_log.create.mockResolvedValue({ id: 'log-1' });

      await service.log({
        context: { user_id: 'user-1' },
        module: 'users',
        action: 'create',
      });

      expect(mockPrisma.audit_log.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ip_address: null,
          user_agent: null,
        }),
      });
    });
  });

  describe('findAll', () => {
    it('should call paginate with correct parameters', async () => {
      const mockResult = {
        data: [{ id: 'log-1' }],
        meta: { total: 1, page: 1, limit: 10, total_pages: 1 },
      };
      mockPaginate.mockResolvedValue(mockResult);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result).toEqual(mockResult);
      expect(mockPaginate).toHaveBeenCalledWith(
        mockPrisma.audit_log,
        {
          where: {},
          orderBy: { created_at: 'desc' },
          include: {
            user: { select: { id: true, email: true, first_name: true, last_name: true } },
          },
        },
        { page: 1, limit: 10 },
      );
    });

    it('should filter by module', async () => {
      mockPaginate.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 10, total_pages: 0 } });

      await service.findAll({ module: 'users' });

      expect(mockPaginate).toHaveBeenCalledWith(
        mockPrisma.audit_log,
        expect.objectContaining({
          where: { module: 'users' },
        }),
        expect.anything(),
      );
    });

    it('should filter by submodule', async () => {
      mockPaginate.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 10, total_pages: 0 } });

      await service.findAll({ submodule: 'profile' });

      expect(mockPaginate).toHaveBeenCalledWith(
        mockPrisma.audit_log,
        expect.objectContaining({
          where: { submodule: 'profile' },
        }),
        expect.anything(),
      );
    });

    it('should filter by action', async () => {
      mockPaginate.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 10, total_pages: 0 } });

      await service.findAll({ action: 'delete' });

      expect(mockPaginate).toHaveBeenCalledWith(
        mockPrisma.audit_log,
        expect.objectContaining({
          where: { action: 'delete' },
        }),
        expect.anything(),
      );
    });

    it('should filter by user_id', async () => {
      mockPaginate.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 10, total_pages: 0 } });

      await service.findAll({ user_id: 'user-1' });

      expect(mockPaginate).toHaveBeenCalledWith(
        mockPrisma.audit_log,
        expect.objectContaining({
          where: { user_id: 'user-1' },
        }),
        expect.anything(),
      );
    });

    it('should filter by resource_id', async () => {
      mockPaginate.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 10, total_pages: 0 } });

      await service.findAll({ resource_id: 'res-1' });

      expect(mockPaginate).toHaveBeenCalledWith(
        mockPrisma.audit_log,
        expect.objectContaining({
          where: { resource_id: 'res-1' },
        }),
        expect.anything(),
      );
    });

    it('should filter by date range', async () => {
      mockPaginate.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 10, total_pages: 0 } });

      await service.findAll({
        date_from: '2026-01-01',
        date_to: '2026-03-01',
      });

      expect(mockPaginate).toHaveBeenCalledWith(
        mockPrisma.audit_log,
        expect.objectContaining({
          where: {
            created_at: {
              gte: new Date('2026-01-01'),
              lte: new Date('2026-03-01'),
            },
          },
        }),
        expect.anything(),
      );
    });

    it('should combine multiple filters', async () => {
      mockPaginate.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 10, total_pages: 0 } });

      await service.findAll({
        module: 'users',
        action: 'create',
        user_id: 'user-1',
      });

      expect(mockPaginate).toHaveBeenCalledWith(
        mockPrisma.audit_log,
        expect.objectContaining({
          where: { module: 'users', action: 'create', user_id: 'user-1' },
        }),
        expect.anything(),
      );
    });
  });
});
