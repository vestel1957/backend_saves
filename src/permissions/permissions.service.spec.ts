import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PermissionsService', () => {
  let service: PermissionsService;
  let prisma: Record<string, any>;

  const mockPrisma = {
    permissions: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PermissionsService>(PermissionsService);
    prisma = module.get(PrismaService) as any;

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── findAll ────────────────────────────────────────────────

  describe('findAll', () => {
    const permissions = [
      { id: 'perm-1', module: 'users', submodule: 'management', action: 'read', description: 'Read users', created_at: new Date() },
      { id: 'perm-2', module: 'users', submodule: 'management', action: 'create', description: 'Create users', created_at: new Date() },
    ];

    it('should return all permissions with no filters', async () => {
      mockPrisma.permissions.findMany.mockResolvedValue(permissions);

      const result = await service.findAll({});

      expect(mockPrisma.permissions.findMany).toHaveBeenCalledWith({
        where: {},
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

      await service.findAll({ module: 'users' });

      expect(mockPrisma.permissions.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { module: 'users' },
        }),
      );
    });

    it('should filter by submodule when provided', async () => {
      mockPrisma.permissions.findMany.mockResolvedValue([]);

      await service.findAll({ submodule: 'management' });

      expect(mockPrisma.permissions.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { submodule: 'management' },
        }),
      );
    });

    it('should filter by both module and submodule', async () => {
      mockPrisma.permissions.findMany.mockResolvedValue([]);

      await service.findAll({ module: 'users', submodule: 'management' });

      expect(mockPrisma.permissions.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { module: 'users', submodule: 'management' },
        }),
      );
    });
  });

  // ─── findAllGrouped ─────────────────────────────────────────

  describe('findAllGrouped', () => {
    it('should return permissions grouped by module and submodule', async () => {
      mockPrisma.permissions.findMany.mockResolvedValue([
        { id: 'p1', module: 'users', submodule: 'management', action: 'read', description: 'Read' },
        { id: 'p2', module: 'users', submodule: 'management', action: 'create', description: 'Create' },
        { id: 'p3', module: 'roles', submodule: 'settings', action: 'read', description: 'Read roles' },
      ]);

      const result = await service.findAllGrouped();

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

    it('should return empty object when no permissions exist', async () => {
      mockPrisma.permissions.findMany.mockResolvedValue([]);

      const result = await service.findAllGrouped();

      expect(result).toEqual({});
    });
  });

  // ─── findOne ────────────────────────────────────────────────

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
      mockPrisma.permissions.findUnique.mockResolvedValue(permission);

      const result = await service.findOne('perm-1');

      expect(result).toEqual(permission);
      expect(mockPrisma.permissions.findUnique).toHaveBeenCalledWith({
        where: { id: 'perm-1' },
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
      mockPrisma.permissions.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ─────────────────────────────────────────────────

  describe('create', () => {
    const createData = {
      module: 'users',
      submodule: 'management',
      action: 'delete',
      description: 'Delete users',
    };

    it('should create a permission successfully', async () => {
      mockPrisma.permissions.findFirst.mockResolvedValue(null); // no duplicate
      const createdPermission = { id: 'perm-new', ...createData, created_at: new Date() };
      mockPrisma.permissions.create.mockResolvedValue(createdPermission);

      const result = await service.create(createData);

      expect(result).toEqual(createdPermission);
      expect(mockPrisma.permissions.findFirst).toHaveBeenCalledWith({
        where: {
          module: createData.module,
          submodule: createData.submodule,
          action: createData.action,
        },
      });
      expect(mockPrisma.permissions.create).toHaveBeenCalledWith({
        data: createData,
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

      await expect(service.create(createData)).rejects.toThrow(ConflictException);
      expect(mockPrisma.permissions.create).not.toHaveBeenCalled();
    });

    it('should include module.submodule.action in conflict error message', async () => {
      mockPrisma.permissions.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(service.create(createData)).rejects.toThrow(
        'El permiso users.management.delete ya existe',
      );
    });
  });

  // ─── createBulk ─────────────────────────────────────────────

  describe('createBulk', () => {
    it('should create new permissions and mark existing ones', async () => {
      const permissionsInput = [
        { module: 'users', submodule: 'management', action: 'read' },
        { module: 'users', submodule: 'management', action: 'create' },
      ];

      mockPrisma.permissions.create
        .mockResolvedValueOnce({
          id: 'perm-new-1',
          module: 'users',
          submodule: 'management',
          action: 'read',
          description: null,
        })
        .mockRejectedValueOnce(new Error('Unique constraint failed'));

      const result = await service.createBulk({ permissions: permissionsInput });

      expect(result.message).toBe('1 permisos creados');
      expect(result.results).toHaveLength(2);
      expect(result.results[0].status).toBe('created');
      expect(result.results[0].id).toBe('perm-new-1');
      expect(result.results[1].status).toBe('already_exists');
      expect(result.results[1].module).toBe('users');
    });

    it('should handle all permissions created successfully', async () => {
      mockPrisma.permissions.create
        .mockResolvedValueOnce({ id: 'p1', module: 'a', submodule: 'b', action: 'c', description: null })
        .mockResolvedValueOnce({ id: 'p2', module: 'd', submodule: 'e', action: 'f', description: null });

      const result = await service.createBulk({
        permissions: [
          { module: 'a', submodule: 'b', action: 'c' },
          { module: 'd', submodule: 'e', action: 'f' },
        ],
      });

      expect(result.message).toBe('2 permisos creados');
      expect(result.results.every((r) => r.status === 'created')).toBe(true);
    });

    it('should handle all permissions already existing', async () => {
      mockPrisma.permissions.create
        .mockRejectedValueOnce(new Error('Unique constraint'))
        .mockRejectedValueOnce(new Error('Unique constraint'));

      const result = await service.createBulk({
        permissions: [
          { module: 'a', submodule: 'b', action: 'c' },
          { module: 'd', submodule: 'e', action: 'f' },
        ],
      });

      expect(result.message).toBe('0 permisos creados');
      expect(result.results.every((r) => r.status === 'already_exists')).toBe(true);
    });
  });

  // ─── update ─────────────────────────────────────────────────

  describe('update', () => {
    const permId = 'perm-1';
    const updateData = { description: 'Updated description' };

    it('should update a permission successfully', async () => {
      mockPrisma.permissions.findUnique.mockResolvedValue({
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

      const result = await service.update(permId, updateData);

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
      mockPrisma.permissions.findUnique.mockResolvedValue(null);

      await expect(service.update('nonexistent', updateData)).rejects.toThrow(NotFoundException);
      expect(mockPrisma.permissions.update).not.toHaveBeenCalled();
    });
  });

  // ─── remove ─────────────────────────────────────────────────

  describe('remove', () => {
    it('should delete a permission successfully', async () => {
      mockPrisma.permissions.findUnique.mockResolvedValue({
        id: 'perm-1',
        module: 'users',
        submodule: 'management',
        action: 'read',
      });
      mockPrisma.permissions.delete.mockResolvedValue({});

      const result = await service.remove('perm-1');

      expect(result).toEqual({ message: 'Permiso eliminado exitosamente' });
      expect(mockPrisma.permissions.delete).toHaveBeenCalledWith({ where: { id: 'perm-1' } });
    });

    it('should throw NotFoundException when permission does not exist', async () => {
      mockPrisma.permissions.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.permissions.delete).not.toHaveBeenCalled();
    });
  });
});
