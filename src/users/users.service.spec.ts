import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

// Helper to create a deeply-mocked PrismaService
function createPrismaMock() {
  return {
    users: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    roles: {
      findMany: jest.fn(),
    },
    user_roles: {
      create: jest.fn(),
      createMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    user_permissions: {
      findMany: jest.fn(),
      createMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    permissions: {
      findMany: jest.fn(),
    },
    password_history: {
      create: jest.fn(),
    },
    areas: {
      findMany: jest.fn(),
    },
    sedes: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  };
}

describe('UsersService', () => {
  let service: UsersService;
  let prisma: ReturnType<typeof createPrismaMock>;

  const TENANT_ID = 'tenant-uuid-1';
  const USER_ID = 'user-uuid-1';
  const ASSIGNED_BY = 'admin-uuid-1';

  beforeEach(async () => {
    prisma = createPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── findAll ─────────────────────────────────────────────────

  describe('findAll', () => {
    const baseUser = {
      id: USER_ID,
      email: 'test@example.com',
      username: 'testuser',
      first_name: 'Test',
      last_name: 'User',
      avatar_url: null,
      document_number: '12345',
      phone: '555-0001',
      is_active: true,
      is_verified: false,
      last_login_at: null,
      created_at: new Date(),
      area: { id: 'area-1', name: 'IT' },
      sede: { id: 'sede-1', name: 'Main' },
      user_roles: [
        { role: { id: 'role-1', name: 'admin' } },
      ],
    };

    it('should return paginated users with defaults', async () => {
      prisma.users.findMany.mockResolvedValue([baseUser]);
      prisma.users.count.mockResolvedValue(1);

      const result = await service.findAll(TENANT_ID, {});

      expect(prisma.users.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID },
          skip: 0,
          take: 10,
        }),
      );
      expect(prisma.users.count).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
      });
      expect(result.data[0]).toHaveProperty('roles');
      expect(result.data[0].roles).toEqual([{ id: 'role-1', name: 'admin' }]);
      expect(result.data[0].user_roles).toBeUndefined();
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        total_pages: 1,
      });
    });

    it('should apply pagination parameters', async () => {
      prisma.users.findMany.mockResolvedValue([]);
      prisma.users.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, { page: 3, limit: 5 });

      expect(prisma.users.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 5,
        }),
      );
      expect((await service.findAll(TENANT_ID, { page: 3, limit: 5 })).meta).toEqual(
        expect.objectContaining({ page: 3, limit: 5 }),
      );
    });

    it('should apply search filter with OR conditions', async () => {
      prisma.users.findMany.mockResolvedValue([]);
      prisma.users.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, { search: 'john' });

      const calledWhere = prisma.users.findMany.mock.calls[0][0].where;
      expect(calledWhere.OR).toBeDefined();
      expect(calledWhere.OR).toHaveLength(5);
      expect(calledWhere.OR[0]).toEqual({
        email: { contains: 'john', mode: 'insensitive' },
      });
    });

    it('should apply is_active filter', async () => {
      prisma.users.findMany.mockResolvedValue([]);
      prisma.users.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, { is_active: true });

      const calledWhere = prisma.users.findMany.mock.calls[0][0].where;
      expect(calledWhere.is_active).toBe(true);
    });

    it('should not include is_active in where when undefined', async () => {
      prisma.users.findMany.mockResolvedValue([]);
      prisma.users.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, {});

      const calledWhere = prisma.users.findMany.mock.calls[0][0].where;
      expect(calledWhere).not.toHaveProperty('is_active');
    });
  });

  // ─── findOne ─────────────────────────────────────────────────

  describe('findOne', () => {
    const userFromDb = {
      id: USER_ID,
      email: 'test@example.com',
      username: 'testuser',
      first_name: 'Test',
      last_name: 'User',
      avatar_url: null,
      document_number: '12345',
      document_type: 'CC',
      hire_date: null,
      blood_type: null,
      eps: null,
      pension_fund: null,
      address: null,
      city: null,
      department: null,
      country: 'Colombia',
      phone: '555-0001',
      area_id: 'area-1',
      sede_id: 'sede-1',
      signature_url: null,
      is_active: true,
      is_verified: false,
      is_super_admin: false,
      last_login_at: null,
      created_at: new Date(),
      updated_at: new Date(),
      area: { id: 'area-1', name: 'IT' },
      sede: { id: 'sede-1', name: 'Main' },
      user_roles: [
        {
          role: { id: 'role-1', name: 'admin', description: 'Administrator' },
        },
      ],
      user_permissions: [
        {
          permission: {
            id: 'perm-1',
            module: 'users',
            submodule: 'manage',
            action: 'read',
          },
        },
      ],
    };

    it('should return user with formatted roles and extra_permissions', async () => {
      prisma.users.findFirst.mockResolvedValue(userFromDb);

      const result = await service.findOne(USER_ID, TENANT_ID);

      expect(prisma.users.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: USER_ID, tenant_id: TENANT_ID },
        }),
      );
      expect(result.roles).toEqual([
        { id: 'role-1', name: 'admin', description: 'Administrator' },
      ]);
      expect(result.extra_permissions).toEqual([
        {
          id: 'perm-1',
          module: 'users',
          submodule: 'manage',
          action: 'read',
          full: 'users.manage.read',
        },
      ]);
      expect(result.user_roles).toBeUndefined();
      expect(result.user_permissions).toBeUndefined();
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.users.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne('nonexistent', TENANT_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ──────────────────────────────────────────────────

  describe('create', () => {
    const createData = {
      email: 'new@example.com',
      username: 'newuser',
      password: 'SecurePass123!',
      first_name: 'New',
      last_name: 'User',
      role_id: 'role-1',
    };

    const createdUser = {
      id: 'new-user-id',
      email: 'new@example.com',
      username: 'newuser',
      first_name: 'New',
      last_name: 'User',
      document_number: null,
      phone: null,
      is_active: true,
      created_at: new Date(),
    };

    beforeEach(() => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
    });

    it('should create a user with role successfully', async () => {
      prisma.users.findFirst.mockResolvedValue(null);

      // $transaction receives a callback; we need to execute it with a tx mock
      prisma.$transaction.mockImplementation(async (cb) => {
        const tx = {
          users: { create: jest.fn().mockResolvedValue(createdUser) },
          user_roles: { create: jest.fn().mockResolvedValue({}) },
        };
        return cb(tx);
      });

      const result = await service.create(TENANT_ID, createData, ASSIGNED_BY);

      expect(prisma.users.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { email: createData.email },
            { username: createData.username },
          ],
        },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith(createData.password, 12);
      expect(result).toEqual(createdUser);
    });

    it('should create a user without role_id', async () => {
      prisma.users.findFirst.mockResolvedValue(null);

      const txUsersCreate = jest.fn().mockResolvedValue(createdUser);
      const txUserRolesCreate = jest.fn();
      prisma.$transaction.mockImplementation(async (cb) => {
        const tx = {
          users: { create: txUsersCreate },
          user_roles: { create: txUserRolesCreate },
        };
        return cb(tx);
      });

      const { role_id, ...dataWithoutRole } = createData;
      await service.create(TENANT_ID, dataWithoutRole, ASSIGNED_BY);

      expect(txUserRolesCreate).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when email already exists', async () => {
      prisma.users.findFirst.mockResolvedValue({
        email: createData.email,
        username: 'otheruser',
      });

      await expect(
        service.create(TENANT_ID, createData, ASSIGNED_BY),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.create(TENANT_ID, createData, ASSIGNED_BY),
      ).rejects.toThrow('El email ya está registrado');
    });

    it('should throw ConflictException when username already exists', async () => {
      prisma.users.findFirst.mockResolvedValue({
        email: 'other@example.com',
        username: createData.username,
      });

      await expect(
        service.create(TENANT_ID, createData, ASSIGNED_BY),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.create(TENANT_ID, createData, ASSIGNED_BY),
      ).rejects.toThrow('El username ya está en uso');
    });
  });

  // ─── update ──────────────────────────────────────────────────

  describe('update', () => {
    const existingUser = {
      id: USER_ID,
      tenant_id: TENANT_ID,
      email: 'test@example.com',
      username: 'testuser',
      is_active: true,
    };

    const updatedUser = {
      id: USER_ID,
      email: 'test@example.com',
      username: 'testuser',
      first_name: 'Updated',
      last_name: 'User',
      document_number: '12345',
      phone: '555-0001',
      avatar_url: null,
      is_active: true,
      updated_at: new Date(),
      area: { id: 'area-1', name: 'IT' },
      sede: { id: 'sede-1', name: 'Main' },
    };

    it('should update user successfully', async () => {
      prisma.users.findFirst.mockResolvedValue(existingUser);
      prisma.$transaction.mockImplementation(async (cb) => {
        const tx = {
          users: { update: jest.fn().mockResolvedValue(updatedUser) },
          user_roles: {
            deleteMany: jest.fn(),
            create: jest.fn(),
          },
        };
        return cb(tx);
      });

      const result = await service.update(
        USER_ID,
        TENANT_ID,
        { first_name: 'Updated' },
        ASSIGNED_BY,
      );

      expect(prisma.users.findFirst).toHaveBeenCalledWith({
        where: { id: USER_ID, tenant_id: TENANT_ID },
      });
      expect(result).toEqual(updatedUser);
    });

    it('should replace role when role_id is provided', async () => {
      prisma.users.findFirst.mockResolvedValue(existingUser);

      const txDeleteMany = jest.fn();
      const txRolesCreate = jest.fn();
      prisma.$transaction.mockImplementation(async (cb) => {
        const tx = {
          users: { update: jest.fn().mockResolvedValue(updatedUser) },
          user_roles: {
            deleteMany: txDeleteMany,
            create: txRolesCreate,
          },
        };
        return cb(tx);
      });

      await service.update(
        USER_ID,
        TENANT_ID,
        { role_id: 'new-role-id' },
        ASSIGNED_BY,
      );

      expect(txDeleteMany).toHaveBeenCalledWith({
        where: { user_id: USER_ID },
      });
      expect(txRolesCreate).toHaveBeenCalledWith({
        data: {
          user_id: USER_ID,
          role_id: 'new-role-id',
          assigned_by: ASSIGNED_BY,
        },
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.users.findFirst.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', TENANT_ID, { first_name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── remove ──────────────────────────────────────────────────

  describe('remove', () => {
    it('should delete user successfully', async () => {
      prisma.users.findFirst.mockResolvedValue({
        id: USER_ID,
        tenant_id: TENANT_ID,
      });
      prisma.users.delete.mockResolvedValue({});

      const result = await service.remove(USER_ID, TENANT_ID);

      expect(prisma.users.delete).toHaveBeenCalledWith({
        where: { id: USER_ID },
      });
      expect(result).toEqual({ message: 'Usuario eliminado exitosamente' });
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.users.findFirst.mockResolvedValue(null);

      await expect(
        service.remove('nonexistent', TENANT_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── changePassword ──────────────────────────────────────────

  describe('changePassword', () => {
    const existingUser = {
      id: USER_ID,
      tenant_id: TENANT_ID,
      password_hash: 'old-hash',
    };

    beforeEach(() => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-password');
    });

    it('should change password successfully', async () => {
      prisma.users.findFirst.mockResolvedValue(existingUser);

      const txPasswordHistoryCreate = jest.fn();
      const txUsersUpdate = jest.fn();
      prisma.$transaction.mockImplementation(async (cb) => {
        const tx = {
          password_history: { create: txPasswordHistoryCreate },
          users: { update: txUsersUpdate },
        };
        return cb(tx);
      });

      const result = await service.changePassword(
        USER_ID,
        TENANT_ID,
        { new_password: 'NewPass123!' },
        ASSIGNED_BY,
      );

      expect(bcrypt.hash).toHaveBeenCalledWith('NewPass123!', 12);
      expect(txPasswordHistoryCreate).toHaveBeenCalledWith({
        data: {
          user_id: USER_ID,
          password_hash: 'old-hash',
          changed_by: ASSIGNED_BY,
        },
      });
      expect(txUsersUpdate).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { password_hash: 'new-hashed-password' },
      });
      expect(result).toEqual({
        message: 'Contraseña actualizada exitosamente',
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.users.findFirst.mockResolvedValue(null);

      await expect(
        service.changePassword(
          'nonexistent',
          TENANT_ID,
          { new_password: 'NewPass123!' },
          ASSIGNED_BY,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── toggleStatus ────────────────────────────────────────────

  describe('toggleStatus', () => {
    it('should deactivate an active user', async () => {
      prisma.users.findFirst.mockResolvedValue({
        id: USER_ID,
        is_active: true,
      });
      prisma.users.update.mockResolvedValue({
        id: USER_ID,
        is_active: false,
      });

      const result = await service.toggleStatus(USER_ID, TENANT_ID);

      expect(prisma.users.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { is_active: false },
        select: { id: true, is_active: true },
      });
      expect(result).toEqual({
        message: 'Usuario desactivado',
        is_active: false,
      });
    });

    it('should activate an inactive user', async () => {
      prisma.users.findFirst.mockResolvedValue({
        id: USER_ID,
        is_active: false,
      });
      prisma.users.update.mockResolvedValue({
        id: USER_ID,
        is_active: true,
      });

      const result = await service.toggleStatus(USER_ID, TENANT_ID);

      expect(prisma.users.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { is_active: true },
        select: { id: true, is_active: true },
      });
      expect(result).toEqual({
        message: 'Usuario activado',
        is_active: true,
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.users.findFirst.mockResolvedValue(null);

      await expect(
        service.toggleStatus('nonexistent', TENANT_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getUserRoles ────────────────────────────────────────────

  describe('getUserRoles', () => {
    it('should return formatted roles for a user', async () => {
      const assignedAt = new Date();
      const expiresAt = new Date('2030-01-01');
      prisma.users.findFirst.mockResolvedValue({
        user_roles: [
          {
            role: { id: 'role-1', name: 'admin', description: 'Admin role' },
            assigned_at: assignedAt,
            expires_at: expiresAt,
          },
        ],
      });

      const result = await service.getUserRoles(USER_ID, TENANT_ID);

      expect(result).toEqual([
        {
          id: 'role-1',
          name: 'admin',
          description: 'Admin role',
          assigned_at: assignedAt,
          expires_at: expiresAt,
        },
      ]);
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.users.findFirst.mockResolvedValue(null);

      await expect(
        service.getUserRoles('nonexistent', TENANT_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── assignRoles ─────────────────────────────────────────────

  describe('assignRoles', () => {
    it('should assign roles successfully', async () => {
      prisma.users.findFirst.mockResolvedValue({ id: USER_ID });
      prisma.roles.findMany.mockResolvedValue([
        { id: 'role-1' },
        { id: 'role-2' },
      ]);
      prisma.user_roles.createMany.mockResolvedValue({ count: 2 });

      const result = await service.assignRoles(
        USER_ID,
        TENANT_ID,
        { role_ids: ['role-1', 'role-2'] },
        ASSIGNED_BY,
      );

      expect(prisma.roles.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['role-1', 'role-2'] },
          tenant_id: TENANT_ID,
          is_active: true,
        },
      });
      expect(prisma.user_roles.createMany).toHaveBeenCalledWith({
        data: [
          { user_id: USER_ID, role_id: 'role-1', assigned_by: ASSIGNED_BY, expires_at: null },
          { user_id: USER_ID, role_id: 'role-2', assigned_by: ASSIGNED_BY, expires_at: null },
        ],
        skipDuplicates: true,
      });
      expect(result).toEqual({ message: 'Roles asignados exitosamente' });
    });

    it('should throw NotFoundException when one or more roles not found', async () => {
      prisma.users.findFirst.mockResolvedValue({ id: USER_ID });
      prisma.roles.findMany.mockResolvedValue([{ id: 'role-1' }]);

      await expect(
        service.assignRoles(
          USER_ID,
          TENANT_ID,
          { role_ids: ['role-1', 'role-nonexistent'] },
          ASSIGNED_BY,
        ),
      ).rejects.toThrow(NotFoundException);

      await expect(
        service.assignRoles(
          USER_ID,
          TENANT_ID,
          { role_ids: ['role-1', 'role-nonexistent'] },
          ASSIGNED_BY,
        ),
      ).rejects.toThrow('Uno o más roles no encontrados en este tenant');
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.users.findFirst.mockResolvedValue(null);

      await expect(
        service.assignRoles(
          'nonexistent',
          TENANT_ID,
          { role_ids: ['role-1'] },
          ASSIGNED_BY,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── removeRole ──────────────────────────────────────────────

  describe('removeRole', () => {
    it('should remove a role successfully', async () => {
      prisma.users.findFirst.mockResolvedValue({ id: USER_ID });
      prisma.user_roles.delete.mockResolvedValue({});

      const result = await service.removeRole(USER_ID, 'role-1', TENANT_ID);

      expect(prisma.user_roles.delete).toHaveBeenCalledWith({
        where: {
          user_id_role_id: { user_id: USER_ID, role_id: 'role-1' },
        },
      });
      expect(result).toEqual({ message: 'Rol removido exitosamente' });
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.users.findFirst.mockResolvedValue(null);

      await expect(
        service.removeRole('nonexistent', 'role-1', TENANT_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getUserPermissions ──────────────────────────────────────

  describe('getUserPermissions', () => {
    it('should return combined role and extra permissions without duplicates', async () => {
      prisma.users.findFirst.mockResolvedValue({ id: USER_ID });

      prisma.$queryRaw.mockResolvedValue([
        {
          permission_id: 'perm-1',
          module: 'users',
          submodule: 'manage',
          action: 'read',
        },
      ]);

      prisma.user_permissions.findMany.mockResolvedValue([
        {
          permission: {
            id: 'perm-1',
            module: 'users',
            submodule: 'manage',
            action: 'read',
          },
        },
        {
          permission: {
            id: 'perm-2',
            module: 'users',
            submodule: 'manage',
            action: 'write',
          },
        },
      ]);

      const result = await service.getUserPermissions(USER_ID, TENANT_ID);

      // perm-1 from role should be kept, perm-1 from extra should be deduplicated,
      // perm-2 is unique so it should be added
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'perm-1',
        module: 'users',
        submodule: 'manage',
        action: 'read',
        full: 'users.manage.read',
        source: 'role',
      });
      expect(result[1]).toEqual({
        id: 'perm-2',
        module: 'users',
        submodule: 'manage',
        action: 'write',
        full: 'users.manage.write',
        source: 'user',
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.users.findFirst.mockResolvedValue(null);

      await expect(
        service.getUserPermissions('nonexistent', TENANT_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── assignExtraPermissions ──────────────────────────────────

  describe('assignExtraPermissions', () => {
    it('should assign extra permissions successfully', async () => {
      prisma.users.findFirst.mockResolvedValue({ id: USER_ID });
      prisma.permissions.findMany.mockResolvedValue([
        { id: 'perm-1' },
        { id: 'perm-2' },
      ]);
      prisma.user_permissions.createMany.mockResolvedValue({ count: 2 });

      const result = await service.assignExtraPermissions(
        USER_ID,
        TENANT_ID,
        { permission_ids: ['perm-1', 'perm-2'] },
        ASSIGNED_BY,
      );

      expect(prisma.permissions.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['perm-1', 'perm-2'] },
          tenant_id: TENANT_ID,
        },
      });
      expect(prisma.user_permissions.createMany).toHaveBeenCalledWith({
        data: [
          { user_id: USER_ID, permission_id: 'perm-1', granted_by: ASSIGNED_BY },
          { user_id: USER_ID, permission_id: 'perm-2', granted_by: ASSIGNED_BY },
        ],
        skipDuplicates: true,
      });
      expect(result).toEqual({
        message: 'Permisos extra asignados exitosamente',
      });
    });

    it('should throw NotFoundException when permission not found', async () => {
      prisma.users.findFirst.mockResolvedValue({ id: USER_ID });
      prisma.permissions.findMany.mockResolvedValue([{ id: 'perm-1' }]);

      await expect(
        service.assignExtraPermissions(
          USER_ID,
          TENANT_ID,
          { permission_ids: ['perm-1', 'perm-nonexistent'] },
          ASSIGNED_BY,
        ),
      ).rejects.toThrow(NotFoundException);

      await expect(
        service.assignExtraPermissions(
          USER_ID,
          TENANT_ID,
          { permission_ids: ['perm-1', 'perm-nonexistent'] },
          ASSIGNED_BY,
        ),
      ).rejects.toThrow('Uno o más permisos no encontrados en este tenant');
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.users.findFirst.mockResolvedValue(null);

      await expect(
        service.assignExtraPermissions(
          'nonexistent',
          TENANT_ID,
          { permission_ids: ['perm-1'] },
          ASSIGNED_BY,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── removeExtraPermission ───────────────────────────────────

  describe('removeExtraPermission', () => {
    it('should remove an extra permission successfully', async () => {
      prisma.users.findFirst.mockResolvedValue({ id: USER_ID });
      prisma.user_permissions.delete.mockResolvedValue({});

      const result = await service.removeExtraPermission(
        USER_ID,
        'perm-1',
        TENANT_ID,
      );

      expect(prisma.user_permissions.delete).toHaveBeenCalledWith({
        where: {
          user_id_permission_id: {
            user_id: USER_ID,
            permission_id: 'perm-1',
          },
        },
      });
      expect(result).toEqual({
        message: 'Permiso extra removido exitosamente',
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.users.findFirst.mockResolvedValue(null);

      await expect(
        service.removeExtraPermission('nonexistent', 'perm-1', TENANT_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── replaceExtraPermissions ─────────────────────────────────

  describe('replaceExtraPermissions', () => {
    it('should replace extra permissions successfully', async () => {
      prisma.users.findFirst.mockResolvedValue({ id: USER_ID });
      prisma.permissions.findMany.mockResolvedValue([
        { id: 'perm-3' },
        { id: 'perm-4' },
      ]);

      const txDeleteMany = jest.fn();
      const txCreateMany = jest.fn();
      prisma.$transaction.mockImplementation(async (cb) => {
        const tx = {
          user_permissions: {
            deleteMany: txDeleteMany,
            createMany: txCreateMany,
          },
        };
        return cb(tx);
      });

      const result = await service.replaceExtraPermissions(
        USER_ID,
        TENANT_ID,
        { permission_ids: ['perm-3', 'perm-4'] },
        ASSIGNED_BY,
      );

      expect(txDeleteMany).toHaveBeenCalledWith({
        where: { user_id: USER_ID },
      });
      expect(txCreateMany).toHaveBeenCalledWith({
        data: [
          { user_id: USER_ID, permission_id: 'perm-3', granted_by: ASSIGNED_BY },
          { user_id: USER_ID, permission_id: 'perm-4', granted_by: ASSIGNED_BY },
        ],
      });
      expect(result).toEqual({
        message: 'Permisos extra actualizados exitosamente',
      });
    });

    it('should clear all permissions when given empty array', async () => {
      prisma.users.findFirst.mockResolvedValue({ id: USER_ID });

      const txDeleteMany = jest.fn();
      const txCreateMany = jest.fn();
      prisma.$transaction.mockImplementation(async (cb) => {
        const tx = {
          user_permissions: {
            deleteMany: txDeleteMany,
            createMany: txCreateMany,
          },
        };
        return cb(tx);
      });

      const result = await service.replaceExtraPermissions(
        USER_ID,
        TENANT_ID,
        { permission_ids: [] },
        ASSIGNED_BY,
      );

      expect(txDeleteMany).toHaveBeenCalledWith({
        where: { user_id: USER_ID },
      });
      expect(txCreateMany).not.toHaveBeenCalled();
      expect(prisma.permissions.findMany).not.toHaveBeenCalled();
      expect(result).toEqual({
        message: 'Permisos extra actualizados exitosamente',
      });
    });

    it('should throw NotFoundException when permission not found', async () => {
      prisma.users.findFirst.mockResolvedValue({ id: USER_ID });
      prisma.permissions.findMany.mockResolvedValue([{ id: 'perm-3' }]);

      await expect(
        service.replaceExtraPermissions(
          USER_ID,
          TENANT_ID,
          { permission_ids: ['perm-3', 'perm-nonexistent'] },
          ASSIGNED_BY,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.users.findFirst.mockResolvedValue(null);

      await expect(
        service.replaceExtraPermissions(
          'nonexistent',
          TENANT_ID,
          { permission_ids: ['perm-1'] },
          ASSIGNED_BY,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getAreas ────────────────────────────────────────────────

  describe('getAreas', () => {
    it('should return active areas for tenant', async () => {
      const areas = [
        { id: 'area-1', name: 'Engineering' },
        { id: 'area-2', name: 'HR' },
      ];
      prisma.areas.findMany.mockResolvedValue(areas);

      const result = await service.getAreas(TENANT_ID);

      expect(prisma.areas.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, is_active: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual(areas);
    });
  });

  // ─── getSedes ────────────────────────────────────────────────

  describe('getSedes', () => {
    it('should return active sedes for tenant', async () => {
      const sedes = [
        { id: 'sede-1', name: 'Bogota' },
        { id: 'sede-2', name: 'Medellin' },
      ];
      prisma.sedes.findMany.mockResolvedValue(sedes);

      const result = await service.getSedes(TENANT_ID);

      expect(prisma.sedes.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, is_active: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual(sedes);
    });
  });
});
