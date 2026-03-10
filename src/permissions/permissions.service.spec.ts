import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PermissionsService', () => {
  let service: PermissionsService;
  let prisma: PrismaService;

  const mockPrisma = {
    permissions: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const tenantId = 'tenant-001';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PermissionsService>(PermissionsService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── findAll ──────────────────────────────────────────────

  describe('findAll', () => {
    const permissions = [
      {
        id: 'perm-1',
        module: 'users',
        submodule: 'management',
        action: 'read',
        description: 'Read users',
        created_at: new Date(),
      },
      {
        id: 'perm-2',
        module: 'users',
        submodule: 'management',
        action: 'create',
        description: 'Create users',
        created_at: new Date(),
      },
    ];

    it('should return all permissions', async () => {
      mockPrisma.permissions.findMany.mockResolvedValue(permissions);

      const result = await service.findAll(tenantId, {});

      expect(mockPrisma.permissions.findMany).toHaveBeenCalledWith({
        where: { tenant_id: tenantId },
        orderBy: [{ module: 'asc' }, { submodule: 'asc' }, { action: 'asc' }],
        select: {
          id: true,
          module: true,
          submodule: true,
          action: true,
          description: true,
          created_at: true,
        },
      });
      expect(result).toEqual(permissions);
    });

    it('should filter by module when provided', async () => {
      mockPrisma.permissions.findMany.mockResolvedValue(permissions);

      await service.findAll(tenantId, { module: 'users' });

      expect(mockPrisma.permissions.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: tenantId, module: 'users' },
        }),
      );
    });

    it('should filter by submodule when provided', async () => {
      mockPrisma.permissions.findMany.mockResolvedValue([]);

      await service.findAll(tenantId, { submodule: 'management' });

      expect(mockPrisma.permissions.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: tenantId, submodule: 'management' },
        }),
      );
    });
  });

  // ─── findAllGrouped ───────────────────────────────────────

  describe('findAllGrouped', () => {
    it('should return permissions grouped by module and submodule', async () => {
      mockPrisma.permissions.findMany.mockResolvedValue([
        { id: 'p1', module: 'users', submodule: 'management', action: 'read', description: 'Read' },
        { id: 'p2', module: 'users', submodule: 'management', action: 'create', description: 'Create' },
        { id: 'p3', module: 'roles', submodule: 'settings', action: 'read', description: 'Read roles' },
      ]);

      const result = await service.findAllGrouped(tenantId);

      expect(result).toEqual({
        users: {
          management: [
            { id: 'p1', action: 'read', description: 'Read', full: 'users.management.read' },
            { id: 'p2', action: 'create', description: 'Create', full: 'users.management.create' },
          ],
        },
        roles: {
          settings: [
            { id: 'p3', action: 'read', description: 'Read roles', full: 'roles.settings.read' },
          ],
        },
      });
    });
  });

  // ─── findOne ──────────────────────────────────────────────

  describe('findOne', () => {
    it('should return a permission by id', async () => {
      const permission = {
        id: 'perm-1',
        module: 'users',
        submodule: 'management',
        action: 'read',
        description: 'Read users',
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockPrisma.permissions.findFirst.mockResolvedValue(permission);

      const result = await service.findOne('perm-1', tenantId);

      expect(result).toEqual(permission);
      expect(mockPrisma.permissions.findFirst).toHaveBeenCalledWith({
        where: { id: 'perm-1', tenant_id: tenantId },
        select: {
          id: true,
          module: true,
          submodule: true,
          action: true,
          description: true,
          created_at: true,
          updated_at: true,
        },
      });
    });

    it('should throw NotFoundException when permission does not exist', async () => {
      mockPrisma.permissions.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', tenantId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── create ───────────────────────────────────────────────

  describe('create', () => {
    const createData = {
      module: 'users',
      submodule: 'management',
      action: 'delete',
      description: 'Delete users',
    };

    it('should create a permission successfully', async () => {
      mockPrisma.permissions.findFirst.mockResolvedValue(null); // no duplicate
      const createdPermission = {
        id: 'perm-new',
        ...createData,
        created_at: new Date(),
      };
      mockPrisma.permissions.create.mockResolvedValue(createdPermission);

      const result = await service.create(tenantId, createData);

      expect(result).toEqual(createdPermission);
      expect(mockPrisma.permissions.findFirst).toHaveBeenCalledWith({
        where: {
          tenant_id: tenantId,
          module: createData.module,
          submodule: createData.submodule,
          action: createData.action,
        },
      });
      expect(mockPrisma.permissions.create).toHaveBeenCalledWith({
        data: { tenant_id: tenantId, ...createData },
        select: {
          id: true,
          module: true,
          submodule: true,
          action: true,
          description: true,
          created_at: true,
        },
      });
    });

    it('should throw ConflictException when permission already exists', async () => {
      mockPrisma.permissions.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(service.create(tenantId, createData)).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrisma.permissions.create).not.toHaveBeenCalled();
    });
  });

  // ─── createBulk ───────────────────────────────────────────

  describe('createBulk', () => {
    it('should create new permissions and mark existing ones', async () => {
      const permissionsInput = [
        { module: 'users', submodule: 'management', action: 'read' },
        { module: 'users', submodule: 'management', action: 'create' },
      ];

      // First permission creates successfully
      mockPrisma.permissions.create
        .mockResolvedValueOnce({
          id: 'perm-new-1',
          module: 'users',
          submodule: 'management',
          action: 'read',
          description: null,
        })
        // Second permission throws (already exists)
        .mockRejectedValueOnce(new Error('Unique constraint failed'));

      const result = await service.createBulk(tenantId, {
        permissions: permissionsInput,
      });

      expect(result.message).toBe('1 permisos creados');
      expect(result.results).toHaveLength(2);
      expect(result.results[0].status).toBe('created');
      expect(result.results[0].id).toBe('perm-new-1');
      expect(result.results[1].status).toBe('already_exists');
      expect(result.results[1].module).toBe('users');
    });
  });

  // ─── update ───────────────────────────────────────────────

  describe('update', () => {
    const permId = 'perm-1';
    const updateData = { description: 'Updated description' };

    it('should update a permission successfully', async () => {
      mockPrisma.permissions.findFirst.mockResolvedValue({
        id: permId,
        module: 'users',
        submodule: 'management',
        action: 'read',
      });
      const updatedPermission = {
        id: permId,
        module: 'users',
        submodule: 'management',
        action: 'read',
        description: 'Updated description',
        updated_at: new Date(),
      };
      mockPrisma.permissions.update.mockResolvedValue(updatedPermission);

      const result = await service.update(permId, tenantId, updateData);

      expect(result).toEqual(updatedPermission);
      expect(mockPrisma.permissions.update).toHaveBeenCalledWith({
        where: { id: permId },
        data: updateData,
        select: {
          id: true,
          module: true,
          submodule: true,
          action: true,
          description: true,
          updated_at: true,
        },
      });
    });

    it('should throw NotFoundException when permission does not exist', async () => {
      mockPrisma.permissions.findFirst.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', tenantId, updateData),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.permissions.update).not.toHaveBeenCalled();
    });
  });

  // ─── remove ───────────────────────────────────────────────

  describe('remove', () => {
    const permId = 'perm-1';

    it('should delete a permission successfully', async () => {
      mockPrisma.permissions.findFirst.mockResolvedValue({
        id: permId,
        module: 'users',
        submodule: 'management',
        action: 'read',
      });
      mockPrisma.permissions.delete.mockResolvedValue({});

      const result = await service.remove(permId, tenantId);

      expect(result).toEqual({ message: 'Permiso eliminado exitosamente' });
      expect(mockPrisma.permissions.delete).toHaveBeenCalledWith({
        where: { id: permId },
      });
    });

    it('should throw NotFoundException when permission does not exist', async () => {
      mockPrisma.permissions.findFirst.mockResolvedValue(null);

      await expect(service.remove('nonexistent', tenantId)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.permissions.delete).not.toHaveBeenCalled();
    });
  });
});
