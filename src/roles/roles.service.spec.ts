import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { RolesService } from './roles.service';
import { PrismaService } from '../prisma/prisma.service';

describe('RolesService', () => {
  let service: RolesService;
  let prisma: Record<string, any>;

  let mockPrisma: Record<string, any>;

  function buildPrismaMock() {
    const m: Record<string, any> = {
      roles: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
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
      $transaction: jest.fn((cb: (tx: any) => Promise<any>) => cb(m)),
    };
    return m;
  }

  beforeEach(async () => {
    mockPrisma = buildPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
    prisma = module.get(PrismaService) as any;
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── findAll ────────────────────────────────────────────────

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
      prisma.roles.findMany.mockResolvedValue(rawRoles);

      const result = await service.findAll({});

      expect(prisma.roles.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          orderBy: { created_at: 'desc' },
          select: expect.objectContaining({
            id: true,
            name: true,
            _count: { select: { user_roles: true, role_permissions: true } },
          }),
        }),
      );
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('total_users', 5);
      expect(result[0]).toHaveProperty('total_permissions', 10);
      expect(result[0]._count).toBeUndefined();
    });

    it('should filter by is_active when provided', async () => {
      prisma.roles.findMany.mockResolvedValue([rawRoles[0]]);

      await service.findAll({ is_active: true });

      expect(prisma.roles.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { is_active: true },
        }),
      );
    });

    it('should not include is_active filter when undefined', async () => {
      prisma.roles.findMany.mockResolvedValue([]);

      await service.findAll({});

      const calledWhere = prisma.roles.findMany.mock.calls[0][0].where;
      expect(calledWhere).not.toHaveProperty('is_active');
    });
  });

  // ─── findOne ────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return a role with mapped permissions', async () => {
      const rawRole = {
        id: 'role-1',
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
          { permission: { id: 'perm-1', module: 'users', submodule: 'management', action: 'read' } },
        ],
      };
      prisma.roles.findUnique.mockResolvedValue(rawRole);

      const result = await service.findOne('role-1');

      expect(prisma.roles.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'role-1' } }),
      );
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
      prisma.roles.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ─────────────────────────────────────────────────

  describe('create', () => {
    const createData = { name: 'New Role', description: 'A new role' };

    it('should create a role successfully', async () => {
      prisma.roles.findFirst.mockResolvedValue(null); // no duplicate
      const createdRole = {
        id: 'role-new',
        name: createData.name,
        description: createData.description,
        is_active: true,
        created_at: new Date(),
      };
      prisma.roles.create.mockResolvedValue(createdRole);

      const result = await service.create(createData);

      expect(result).toEqual(createdRole);
      expect(prisma.roles.findFirst).toHaveBeenCalledWith({
        where: { name: createData.name },
      });
    });

    it('should throw ConflictException when role name already exists', async () => {
      prisma.roles.findFirst.mockResolvedValue({ id: 'existing', name: createData.name });

      await expect(service.create(createData)).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException when parent role is not found', async () => {
      prisma.roles.findFirst.mockResolvedValue(null); // no duplicate name
      prisma.roles.findUnique.mockResolvedValue(null); // parent not found

      await expect(
        service.create({ ...createData, parent_role_id: 'bad-parent' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create role with permission_ids', async () => {
      prisma.roles.findFirst.mockResolvedValue(null);
      prisma.roles.create.mockResolvedValue({ id: 'role-new', name: 'New', is_active: true, created_at: new Date() });
      prisma.permissions.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
      prisma.role_permissions.createMany.mockResolvedValue({ count: 2 });

      await service.create({ name: 'New', permission_ids: ['p1', 'p2'] });

      expect(prisma.role_permissions.createMany).toHaveBeenCalledWith({
        data: [
          { role_id: 'role-new', permission_id: 'p1' },
          { role_id: 'role-new', permission_id: 'p2' },
        ],
      });
    });

    it('should throw NotFoundException when some permission_ids not found', async () => {
      prisma.roles.findFirst.mockResolvedValue(null);
      prisma.roles.create.mockResolvedValue({ id: 'role-new', name: 'New', is_active: true, created_at: new Date() });
      prisma.permissions.findMany.mockResolvedValue([{ id: 'p1' }]); // only 1 of 2

      await expect(
        service.create({ name: 'New', permission_ids: ['p1', 'p2'] }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ─────────────────────────────────────────────────

  describe('update', () => {
    const roleId = 'role-1';

    it('should update a role successfully', async () => {
      prisma.roles.findUnique.mockResolvedValue({ id: roleId, name: 'Old Name', is_system: false });
      prisma.roles.findFirst.mockResolvedValue(null); // no conflict
      const updatedRole = { id: roleId, name: 'Updated Role', description: null, is_active: true, updated_at: new Date() };
      prisma.roles.update.mockResolvedValue(updatedRole);

      const result = await service.update(roleId, { name: 'Updated Role' });

      expect(result).toEqual(updatedRole);
    });

    it('should throw NotFoundException when role does not exist', async () => {
      prisma.roles.findUnique.mockResolvedValue(null);

      await expect(service.update('nonexistent', { name: 'Test' })).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when updating a system role', async () => {
      prisma.roles.findUnique.mockResolvedValue({ id: roleId, name: 'System Admin', is_system: true });

      await expect(service.update(roleId, { name: 'Test' })).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException when new name already taken by another role', async () => {
      prisma.roles.findUnique.mockResolvedValue({ id: roleId, name: 'Old Name', is_system: false });
      prisma.roles.findFirst.mockResolvedValue({ id: 'other-role', name: 'Taken Name' });

      await expect(service.update(roleId, { name: 'Taken Name' })).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when setting self as parent', async () => {
      prisma.roles.findUnique.mockResolvedValue({ id: roleId, name: 'Role', is_system: false });

      await expect(
        service.update(roleId, { parent_role_id: roleId }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException when parent role does not exist', async () => {
      prisma.roles.findUnique
        .mockResolvedValueOnce({ id: roleId, name: 'Role', is_system: false }) // role lookup
        .mockResolvedValueOnce(null); // parent lookup

      await expect(
        service.update(roleId, { parent_role_id: 'nonexistent' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should detect cycle in hierarchy and throw ConflictException', async () => {
      // role-1 -> set parent to role-2, but role-2 already has parent role-1 => cycle
      prisma.roles.findUnique
        .mockResolvedValueOnce({ id: 'role-1', name: 'Role1', is_system: false }) // role lookup
        .mockResolvedValueOnce({ id: 'role-2', name: 'Role2' }); // parent lookup

      // detectCycle traversal: role-2's parent is role-1 => cycle found
      prisma.roles.findFirst.mockResolvedValue({ parent_role_id: 'role-1' });

      await expect(
        service.update('role-1', { parent_role_id: 'role-2' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── remove ─────────────────────────────────────────────────

  describe('remove', () => {
    it('should delete a role successfully', async () => {
      prisma.roles.findUnique.mockResolvedValue({ id: 'role-1', name: 'Custom Role', is_system: false });
      prisma.roles.delete.mockResolvedValue({});

      const result = await service.remove('role-1');

      expect(result).toEqual({ message: 'Rol eliminado exitosamente' });
      expect(prisma.roles.delete).toHaveBeenCalledWith({ where: { id: 'role-1' } });
    });

    it('should throw NotFoundException when role does not exist', async () => {
      prisma.roles.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when deleting a system role', async () => {
      prisma.roles.findUnique.mockResolvedValue({ id: 'role-1', name: 'System Admin', is_system: true });

      await expect(service.remove('role-1')).rejects.toThrow(ForbiddenException);
      expect(prisma.roles.delete).not.toHaveBeenCalled();
    });
  });

  // ─── getRolePermissions ─────────────────────────────────────

  describe('getRolePermissions', () => {
    it('should return permissions with full string', async () => {
      prisma.roles.findUnique.mockResolvedValue({
        role_permissions: [
          { permission: { id: 'perm-1', module: 'users', submodule: 'management', action: 'create', description: 'Create users' } },
          { permission: { id: 'perm-2', module: 'roles', submodule: 'settings', action: 'read', description: 'Read roles' } },
        ],
      });

      const result = await service.getRolePermissions('role-1');

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
      prisma.roles.findUnique.mockResolvedValue(null);

      await expect(service.getRolePermissions('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── assignPermissions ──────────────────────────────────────

  describe('assignPermissions', () => {
    const roleId = 'role-1';
    const permissionIds = ['perm-1', 'perm-2'];

    it('should assign permissions successfully', async () => {
      prisma.roles.findUnique.mockResolvedValue({ id: roleId });
      prisma.permissions.findMany.mockResolvedValue([{ id: 'perm-1' }, { id: 'perm-2' }]);
      prisma.role_permissions.createMany.mockResolvedValue({ count: 2 });

      const result = await service.assignPermissions(roleId, { permission_ids: permissionIds });

      expect(result).toEqual({ message: 'Permisos asignados exitosamente' });
      expect(prisma.role_permissions.createMany).toHaveBeenCalledWith({
        data: [
          { role_id: roleId, permission_id: 'perm-1' },
          { role_id: roleId, permission_id: 'perm-2' },
        ],
        skipDuplicates: true,
      });
    });

    it('should throw NotFoundException when role does not exist', async () => {
      prisma.roles.findUnique.mockResolvedValue(null);

      await expect(
        service.assignPermissions('nonexistent', { permission_ids: permissionIds }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when some permissions are not found', async () => {
      prisma.roles.findUnique.mockResolvedValue({ id: roleId });
      prisma.permissions.findMany.mockResolvedValue([{ id: 'perm-1' }]); // only 1 of 2

      await expect(
        service.assignPermissions(roleId, { permission_ids: permissionIds }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.role_permissions.createMany).not.toHaveBeenCalled();
    });
  });

  // ─── removePermission ──────────────────────────────────────

  describe('removePermission', () => {
    it('should remove a permission from a role successfully', async () => {
      prisma.roles.findUnique.mockResolvedValue({ id: 'role-1' });
      prisma.role_permissions.delete.mockResolvedValue({});

      const result = await service.removePermission('role-1', 'perm-1');

      expect(result).toEqual({ message: 'Permiso removido exitosamente' });
      expect(prisma.role_permissions.delete).toHaveBeenCalledWith({
        where: { role_id_permission_id: { role_id: 'role-1', permission_id: 'perm-1' } },
      });
    });

    it('should throw NotFoundException when role does not exist', async () => {
      prisma.roles.findUnique.mockResolvedValue(null);

      await expect(service.removePermission('nonexistent', 'perm-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getRoleUsers ──────────────────────────────────────────

  describe('getRoleUsers', () => {
    it('should return users with assignment info', async () => {
      const assignedAt = new Date('2025-06-01');
      const expiresAt = new Date('2026-06-01');

      prisma.roles.findUnique.mockResolvedValue({
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

      const result = await service.getRoleUsers('role-1');

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
      prisma.roles.findUnique.mockResolvedValue(null);

      await expect(service.getRoleUsers('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
