import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { RolesService } from './roles.service';
import { PrismaService } from '../prisma/prisma.service';

describe('RolesService', () => {
  let service: RolesService;
  let prisma: PrismaService;

  const mockPrisma = {
    roles: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    permissions: {
      findMany: jest.fn(),
    },
    role_permissions: {
      createMany: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const tenantId = 'tenant-001';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── findAll ──────────────────────────────────────────────

  describe('findAll', () => {
    const rawRoles = [
      {
        id: 'role-1',
        name: 'Admin',
        description: 'Administrator',
        is_active: true,
        is_system: true,
        parent_role_id: null,
        created_at: new Date('2025-01-01'),
        parent_role: null,
        _count: { user_roles: 5, role_permissions: 10 },
      },
      {
        id: 'role-2',
        name: 'Editor',
        description: 'Editor role',
        is_active: true,
        is_system: false,
        parent_role_id: 'role-1',
        created_at: new Date('2025-01-02'),
        parent_role: { id: 'role-1', name: 'Admin' },
        _count: { user_roles: 3, role_permissions: 6 },
      },
    ];

    it('should return all roles with mapped counts', async () => {
      mockPrisma.roles.findMany.mockResolvedValue(rawRoles);

      const result = await service.findAll(tenantId, {});

      expect(mockPrisma.roles.findMany).toHaveBeenCalledWith({
        where: { tenant_id: tenantId },
        orderBy: { created_at: 'desc' },
        select: expect.objectContaining({
          id: true,
          name: true,
          _count: { select: { user_roles: true, role_permissions: true } },
        }),
      });
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('total_users', 5);
      expect(result[0]).toHaveProperty('total_permissions', 10);
      expect(result[0]._count).toBeUndefined();
    });

    it('should filter by is_active when provided', async () => {
      mockPrisma.roles.findMany.mockResolvedValue([rawRoles[0]]);

      await service.findAll(tenantId, { is_active: true });

      expect(mockPrisma.roles.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: tenantId, is_active: true },
        }),
      );
    });
  });

  // ─── findOne ──────────────────────────────────────────────

  describe('findOne', () => {
    const roleId = 'role-1';

    it('should return a role with mapped permissions', async () => {
      const rawRole = {
        id: roleId,
        name: 'Admin',
        description: 'Administrator',
        is_active: true,
        is_system: true,
        parent_role_id: null,
        created_at: new Date(),
        updated_at: new Date(),
        parent_role: null,
        child_roles: [],
        role_permissions: [
          {
            permission: {
              id: 'perm-1',
              module: 'users',
              submodule: 'management',
              action: 'read',
            },
          },
        ],
      };
      mockPrisma.roles.findFirst.mockResolvedValue(rawRole);

      const result = await service.findOne(roleId, tenantId);

      expect(mockPrisma.roles.findFirst).toHaveBeenCalledWith({
        where: { id: roleId, tenant_id: tenantId },
        select: expect.objectContaining({ id: true, name: true }),
      });
      expect(result.permissions).toHaveLength(1);
      expect(result.permissions[0]).toEqual({
        id: 'perm-1',
        module: 'users',
        submodule: 'management',
        action: 'read',
        full: 'users.management.read',
      });
      expect(result.role_permissions).toBeUndefined();
    });

    it('should throw NotFoundException when role does not exist', async () => {
      mockPrisma.roles.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', tenantId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── create ───────────────────────────────────────────────

  describe('create', () => {
    const createData = {
      name: 'New Role',
      description: 'A new role',
    };

    it('should create a role successfully', async () => {
      mockPrisma.roles.findFirst.mockResolvedValue(null); // no duplicate
      const createdRole = {
        id: 'role-new',
        name: createData.name,
        description: createData.description,
        is_active: true,
        created_at: new Date(),
      };
      mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));
      mockPrisma.roles.create.mockResolvedValue(createdRole);

      const result = await service.create(tenantId, createData);

      expect(result).toEqual(createdRole);
      expect(mockPrisma.roles.findFirst).toHaveBeenCalledWith({
        where: { tenant_id: tenantId, name: createData.name },
      });
    });

    it('should throw ConflictException when role name already exists', async () => {
      mockPrisma.roles.findFirst.mockResolvedValue({ id: 'existing', name: createData.name });

      await expect(service.create(tenantId, createData)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException when parent role is not found', async () => {
      // First call: no duplicate name
      mockPrisma.roles.findFirst
        .mockResolvedValueOnce(null)
        // Second call: parent not found
        .mockResolvedValueOnce(null);

      await expect(
        service.create(tenantId, { ...createData, parent_role_id: 'bad-parent' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ───────────────────────────────────────────────

  describe('update', () => {
    const roleId = 'role-1';
    const updateData = { name: 'Updated Role' };

    it('should update a role successfully', async () => {
      mockPrisma.roles.findFirst.mockResolvedValue({
        id: roleId,
        name: 'Old Name',
        is_system: false,
      });
      // No duplicate name check match
      mockPrisma.roles.findFirst.mockResolvedValueOnce({
        id: roleId,
        name: 'Old Name',
        is_system: false,
      });
      mockPrisma.roles.findFirst.mockResolvedValueOnce(null); // no conflict
      const updatedRole = {
        id: roleId,
        name: 'Updated Role',
        description: null,
        is_active: true,
        updated_at: new Date(),
      };
      mockPrisma.roles.update.mockResolvedValue(updatedRole);

      const result = await service.update(roleId, tenantId, updateData);

      expect(result).toEqual(updatedRole);
    });

    it('should throw NotFoundException when role does not exist', async () => {
      mockPrisma.roles.findFirst.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', tenantId, updateData),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when updating a system role', async () => {
      mockPrisma.roles.findFirst.mockResolvedValue({
        id: roleId,
        name: 'System Admin',
        is_system: true,
      });

      await expect(
        service.update(roleId, tenantId, updateData),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── remove ───────────────────────────────────────────────

  describe('remove', () => {
    const roleId = 'role-1';

    it('should delete a role successfully', async () => {
      mockPrisma.roles.findFirst.mockResolvedValue({
        id: roleId,
        name: 'Custom Role',
        is_system: false,
      });
      mockPrisma.roles.delete.mockResolvedValue({});

      const result = await service.remove(roleId, tenantId);

      expect(result).toEqual({ message: 'Rol eliminado exitosamente' });
      expect(mockPrisma.roles.delete).toHaveBeenCalledWith({ where: { id: roleId } });
    });

    it('should throw NotFoundException when role does not exist', async () => {
      mockPrisma.roles.findFirst.mockResolvedValue(null);

      await expect(service.remove('nonexistent', tenantId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when deleting a system role', async () => {
      mockPrisma.roles.findFirst.mockResolvedValue({
        id: roleId,
        name: 'System Admin',
        is_system: true,
      });

      await expect(service.remove(roleId, tenantId)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.roles.delete).not.toHaveBeenCalled();
    });
  });

  // ─── getRolePermissions ───────────────────────────────────

  describe('getRolePermissions', () => {
    const roleId = 'role-1';

    it('should return permissions with full string', async () => {
      mockPrisma.roles.findFirst.mockResolvedValue({
        role_permissions: [
          {
            permission: {
              id: 'perm-1',
              module: 'users',
              submodule: 'management',
              action: 'create',
              description: 'Create users',
            },
          },
          {
            permission: {
              id: 'perm-2',
              module: 'roles',
              submodule: 'settings',
              action: 'read',
              description: 'Read roles',
            },
          },
        ],
      });

      const result = await service.getRolePermissions(roleId, tenantId);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'perm-1',
        module: 'users',
        submodule: 'management',
        action: 'create',
        description: 'Create users',
        full: 'users.management.create',
      });
      expect(result[1].full).toBe('roles.settings.read');
    });

    it('should throw NotFoundException when role does not exist', async () => {
      mockPrisma.roles.findFirst.mockResolvedValue(null);

      await expect(
        service.getRolePermissions('nonexistent', tenantId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── assignPermissions ────────────────────────────────────

  describe('assignPermissions', () => {
    const roleId = 'role-1';
    const permissionIds = ['perm-1', 'perm-2'];

    it('should assign permissions successfully', async () => {
      mockPrisma.roles.findFirst.mockResolvedValue({ id: roleId });
      mockPrisma.permissions.findMany.mockResolvedValue([
        { id: 'perm-1' },
        { id: 'perm-2' },
      ]);
      mockPrisma.role_permissions.createMany.mockResolvedValue({ count: 2 });

      const result = await service.assignPermissions(roleId, tenantId, {
        permission_ids: permissionIds,
      });

      expect(result).toEqual({ message: 'Permisos asignados exitosamente' });
      expect(mockPrisma.role_permissions.createMany).toHaveBeenCalledWith({
        data: [
          { role_id: roleId, permission_id: 'perm-1' },
          { role_id: roleId, permission_id: 'perm-2' },
        ],
        skipDuplicates: true,
      });
    });

    it('should throw NotFoundException when role does not exist', async () => {
      mockPrisma.roles.findFirst.mockResolvedValue(null);

      await expect(
        service.assignPermissions('nonexistent', tenantId, {
          permission_ids: permissionIds,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when some permissions are not found', async () => {
      mockPrisma.roles.findFirst.mockResolvedValue({ id: roleId });
      // Only 1 of 2 permissions found
      mockPrisma.permissions.findMany.mockResolvedValue([{ id: 'perm-1' }]);

      await expect(
        service.assignPermissions(roleId, tenantId, {
          permission_ids: permissionIds,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.role_permissions.createMany).not.toHaveBeenCalled();
    });
  });

  // ─── removePermission ────────────────────────────────────

  describe('removePermission', () => {
    it('should remove a permission from a role successfully', async () => {
      mockPrisma.roles.findFirst.mockResolvedValue({ id: 'role-1' });
      mockPrisma.role_permissions.delete.mockResolvedValue({});

      const result = await service.removePermission('role-1', 'perm-1', tenantId);

      expect(result).toEqual({ message: 'Permiso removido exitosamente' });
      expect(mockPrisma.role_permissions.delete).toHaveBeenCalledWith({
        where: {
          role_id_permission_id: { role_id: 'role-1', permission_id: 'perm-1' },
        },
      });
    });
  });

  // ─── getRoleUsers ─────────────────────────────────────────

  describe('getRoleUsers', () => {
    const roleId = 'role-1';

    it('should return users with assignment info', async () => {
      const assignedAt = new Date('2025-06-01');
      const expiresAt = new Date('2026-06-01');

      mockPrisma.roles.findFirst.mockResolvedValue({
        user_roles: [
          {
            assigned_at: assignedAt,
            expires_at: expiresAt,
            user: {
              id: 'user-1',
              email: 'alice@example.com',
              username: 'alice',
              first_name: 'Alice',
              last_name: 'Smith',
              is_active: true,
            },
          },
        ],
      });

      const result = await service.getRoleUsers(roleId, tenantId);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'user-1',
        email: 'alice@example.com',
        username: 'alice',
        first_name: 'Alice',
        last_name: 'Smith',
        is_active: true,
        assigned_at: assignedAt,
        expires_at: expiresAt,
      });
    });

    it('should throw NotFoundException when role does not exist', async () => {
      mockPrisma.roles.findFirst.mockResolvedValue(null);

      await expect(
        service.getRoleUsers('nonexistent', tenantId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
