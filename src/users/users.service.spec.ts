import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('UsersService', () => {
  let service: UsersService;
  let prisma: Record<string, any>;
  let emailService: Record<string, any>;

  const USER_ID = 'user-uuid-1';
  const ASSIGNED_BY = 'admin-uuid-1';

  const mockUser = {
    id: USER_ID,
    email: 'john@example.com',
    username: 'john',
    first_name: 'John',
    last_name: 'Doe',
    password_hash: 'hashed-password',
    document_number: '123456',
    phone: '555-0100',
    avatar_url: null,
    is_active: true,
    is_verified: false,
    is_super_admin: false,
    last_login_at: null,
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
    deleted_at: null,
    area: null,
    area_id: null,
  };

  // We create the mock inside a factory so $transaction can forward calls to the same mock instance.
  let mockPrisma: Record<string, any>;

  function buildPrismaMock() {
    const m: Record<string, any> = {
      users: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      user_roles: {
        createMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      user_sedes: {
        createMany: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      user_permissions: {
        findMany: jest.fn(),
        createMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      user_sessions: {
        deleteMany: jest.fn(),
      },
      roles: {
        findMany: jest.fn(),
      },
      permissions: {
        findMany: jest.fn(),
      },
      password_history: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      areas: {
        findMany: jest.fn(),
      },
      sedes: {
        findMany: jest.fn(),
      },
      $queryRaw: jest.fn(),
      // $transaction passes the same mock object so inner calls are tracked
      $transaction: jest.fn((cb: (tx: any) => Promise<any>) => cb(m)),
    };
    return m;
  }

  beforeEach(async () => {
    mockPrisma = buildPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: EmailService,
          useValue: {
            sendWelcomeCredentials: jest.fn().mockResolvedValue(undefined),
            sendAdminPasswordReset: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get(PrismaService) as any;
    emailService = module.get(EmailService) as any;
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── findAll ────────────────────────────────────────────────

  describe('findAll', () => {
    const baseUser = {
      ...mockUser,
      user_roles: [
        { role: { id: 'role-1', name: 'admin' }, assigned_at: new Date(), expires_at: null },
      ],
      user_sedes: [
        { sede: { id: 'sede-1', name: 'Main' }, area: null },
      ],
    };

    it('should return paginated users with defaults', async () => {
      prisma.users.findMany.mockResolvedValue([baseUser]);
      prisma.users.count.mockResolvedValue(1);

      const result = await service.findAll({});

      expect(prisma.users.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deleted_at: null },
          skip: 0,
          take: 10,
        }),
      );
      expect(result.data[0]).toHaveProperty('roles');
      expect(result.data[0].roles).toEqual([{ id: 'role-1', name: 'admin' }]);
      expect(result.data[0].sedes).toEqual([{ id: 'sede-1', name: 'Main' }]);
      expect(result.data[0].user_roles).toBeUndefined();
      expect(result.data[0].user_sedes).toBeUndefined();
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 10, total_pages: 1 });
    });

    it('should apply pagination parameters', async () => {
      prisma.users.findMany.mockResolvedValue([]);
      prisma.users.count.mockResolvedValue(0);

      const result = await service.findAll({ page: 3, limit: 5 });

      expect(prisma.users.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 }),
      );
      expect(result.meta).toEqual(expect.objectContaining({ page: 3, limit: 5 }));
    });

    it('should clamp page to minimum 1', async () => {
      prisma.users.findMany.mockResolvedValue([]);
      prisma.users.count.mockResolvedValue(0);

      const result = await service.findAll({ page: -5, limit: 10 });

      expect(result.meta.page).toBe(1);
      expect(prisma.users.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0 }),
      );
    });

    it('should clamp limit to max 100', async () => {
      prisma.users.findMany.mockResolvedValue([]);
      prisma.users.count.mockResolvedValue(0);

      const result = await service.findAll({ page: 1, limit: 999 });

      expect(result.meta.limit).toBe(100);
    });

    it('should apply search filter with OR conditions', async () => {
      prisma.users.findMany.mockResolvedValue([]);
      prisma.users.count.mockResolvedValue(0);

      await service.findAll({ search: 'john' });

      const calledWhere = prisma.users.findMany.mock.calls[0][0].where;
      expect(calledWhere.OR).toBeDefined();
      expect(calledWhere.OR).toHaveLength(5);
      expect(calledWhere.OR[0]).toEqual({
        email: { contains: 'john', mode: 'insensitive' },
      });
    });

    it('should apply is_active filter when provided', async () => {
      prisma.users.findMany.mockResolvedValue([]);
      prisma.users.count.mockResolvedValue(0);

      await service.findAll({ is_active: true });

      const calledWhere = prisma.users.findMany.mock.calls[0][0].where;
      expect(calledWhere.is_active).toBe(true);
    });

    it('should not include is_active when undefined', async () => {
      prisma.users.findMany.mockResolvedValue([]);
      prisma.users.count.mockResolvedValue(0);

      await service.findAll({});

      const calledWhere = prisma.users.findMany.mock.calls[0][0].where;
      expect(calledWhere).not.toHaveProperty('is_active');
    });
  });

  // ─── findOne ────────────────────────────────────────────────

  describe('findOne', () => {
    const userFromDb = {
      ...mockUser,
      document_type: 'CC',
      hire_date: null,
      blood_type: null,
      eps: null,
      pension_fund: null,
      address: null,
      city: null,
      department: null,
      country: 'Colombia',
      signature_url: null,
      area: { id: 'area-1', name: 'IT' },
      user_sedes: [
        { sede_id: 's1', area_id: null, assigned_at: new Date(), sede: { id: 's1', name: 'Main' }, area: null },
      ],
      user_roles: [
        { assigned_at: new Date(), expires_at: null, role: { id: 'role-1', name: 'admin', description: 'Administrator' } },
      ],
      user_permissions: [
        { permission: { id: 'perm-1', module: 'users', submodule: 'manage', action: 'read' } },
      ],
    };

    it('should return user with formatted roles, sedes and extra_permissions', async () => {
      prisma.users.findFirst.mockResolvedValue(userFromDb);

      const result = await service.findOne(USER_ID);

      expect(prisma.users.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: USER_ID, deleted_at: null },
        }),
      );
      expect(result.roles).toEqual([{ id: 'role-1', name: 'admin', description: 'Administrator' }]);
      expect(result.sedes).toEqual([{ id: 's1', name: 'Main' }]);
      expect(result.extra_permissions).toEqual([
        { id: 'perm-1', module: 'users', submodule: 'manage', action: 'read', full: 'users.manage.read' },
      ]);
      expect(result.user_roles).toBeUndefined();
      expect(result.user_sedes).toBeUndefined();
      expect(result.user_permissions).toBeUndefined();
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.users.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ─────────────────────────────────────────────────

  describe('create', () => {
    const createdUser = {
      id: 'new-user-id',
      email: 'new@example.com',
      username: 'new',
      first_name: 'New',
      last_name: 'User',
      document_number: null,
      phone: null,
      is_active: true,
      created_at: new Date(),
    };

    beforeEach(() => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      // Default: no existing user with this email, no existing username
      prisma.users.findFirst.mockResolvedValue(null);
      prisma.users.create.mockResolvedValue(createdUser);
    });

    it('should create a user and send welcome email', async () => {
      const result = await service.create(
        { email: 'new@example.com', first_name: 'New', last_name: 'User' },
        ASSIGNED_BY,
      );

      expect(result.id).toBe('new-user-id');
      expect(emailService.sendWelcomeCredentials).toHaveBeenCalledWith(
        'new@example.com',
        expect.any(String),
        'New',
      );
    });

    it('should throw ConflictException when email already exists', async () => {
      prisma.users.findFirst.mockResolvedValue({ email: 'new@example.com' });

      await expect(
        service.create({ email: 'new@example.com' }, ASSIGNED_BY),
      ).rejects.toThrow(ConflictException);
    });

    it('should generate username from email prefix', async () => {
      await service.create({ email: 'jane.doe@company.com' }, ASSIGNED_BY);

      expect(prisma.users.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ username: 'janedoe' }),
        }),
      );
    });

    it('should append counter if username already taken', async () => {
      prisma.users.findFirst
        .mockResolvedValueOnce(null)        // email check
        .mockResolvedValueOnce({ id: 'x' }) // username 'janedoe' taken
        .mockResolvedValueOnce(null);        // username 'janedoe1' free

      await service.create({ email: 'jane.doe@company.com' }, ASSIGNED_BY);

      expect(prisma.users.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ username: 'janedoe1' }),
        }),
      );
    });

    it('should use provided password instead of generating one', async () => {
      await service.create({ email: 'new@example.com', password: 'MyPass123!' }, ASSIGNED_BY);

      expect(bcrypt.hash).toHaveBeenCalledWith('MyPass123!', 12);
    });

    it('should generate temporary password when none provided', async () => {
      await service.create({ email: 'new@example.com' }, ASSIGNED_BY);

      expect(bcrypt.hash).toHaveBeenCalledWith(expect.any(String), 12);
      const password = (bcrypt.hash as jest.Mock).mock.calls[0][0];
      expect(password.length).toBeGreaterThanOrEqual(12);
    });

    it('should create user_sedes when sede_ids provided', async () => {
      prisma.user_sedes.createMany.mockResolvedValue({ count: 2 });

      await service.create(
        { email: 'new@example.com', sede_ids: ['s1', 's2'], area_id: 'a1' },
        ASSIGNED_BY,
      );

      expect(prisma.user_sedes.createMany).toHaveBeenCalledWith({
        data: [
          { user_id: 'new-user-id', sede_id: 's1', area_id: 'a1' },
          { user_id: 'new-user-id', sede_id: 's2', area_id: 'a1' },
        ],
      });
    });

    it('should assign role when role_id provided', async () => {
      prisma.user_roles.create.mockResolvedValue({});

      await service.create({ email: 'new@example.com', role_id: 'role-1' }, ASSIGNED_BY);

      expect(prisma.user_roles.create).toHaveBeenCalledWith({
        data: { user_id: 'new-user-id', role_id: 'role-1', assigned_by: ASSIGNED_BY },
      });
    });

    it('should not create user_roles when role_id is not provided', async () => {
      await service.create({ email: 'new@example.com' }, ASSIGNED_BY);

      expect(prisma.user_roles.create).not.toHaveBeenCalled();
    });

    it('should not fail if welcome email fails', async () => {
      emailService.sendWelcomeCredentials.mockRejectedValue(new Error('SMTP down'));

      const result = await service.create({ email: 'new@example.com' }, ASSIGNED_BY);

      expect(result.id).toBe('new-user-id');
    });
  });

  // ─── update ─────────────────────────────────────────────────

  describe('update', () => {
    const updatedUserFromDb = {
      ...mockUser,
      first_name: 'Updated',
      user_sedes: [],
      area: null,
    };

    beforeEach(() => {
      prisma.users.findFirst.mockResolvedValue(mockUser);
      prisma.users.update.mockResolvedValue(updatedUserFromDb);
    });

    it('should update user fields', async () => {
      const result = await service.update(USER_ID, { first_name: 'Updated' });

      expect(prisma.users.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: USER_ID },
          data: expect.objectContaining({ first_name: 'Updated' }),
        }),
      );
      expect(result.sedes).toBeDefined();
      expect(result.user_sedes).toBeUndefined();
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.users.findFirst.mockResolvedValue(null);

      await expect(service.update('nonexistent', { first_name: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('should replace sede when sede_id provided', async () => {
      prisma.user_sedes.deleteMany.mockResolvedValue({});
      prisma.user_sedes.create.mockResolvedValue({});

      await service.update(USER_ID, { sede_id: 'new-sede' });

      expect(prisma.user_sedes.deleteMany).toHaveBeenCalledWith({ where: { user_id: USER_ID } });
      expect(prisma.user_sedes.create).toHaveBeenCalledWith({
        data: { user_id: USER_ID, sede_id: 'new-sede', area_id: null },
      });
    });

    it('should clear all sedes when sede_id is null', async () => {
      prisma.user_sedes.deleteMany.mockResolvedValue({});

      await service.update(USER_ID, { sede_id: null });

      expect(prisma.user_sedes.deleteMany).toHaveBeenCalled();
      expect(prisma.user_sedes.create).not.toHaveBeenCalled();
    });

    it('should replace role when role_id provided', async () => {
      prisma.user_roles.deleteMany.mockResolvedValue({});
      prisma.user_roles.create.mockResolvedValue({});

      await service.update(USER_ID, { role_id: 'new-role' }, ASSIGNED_BY);

      expect(prisma.user_roles.deleteMany).toHaveBeenCalledWith({ where: { user_id: USER_ID } });
      expect(prisma.user_roles.create).toHaveBeenCalledWith({
        data: { user_id: USER_ID, role_id: 'new-role', assigned_by: ASSIGNED_BY },
      });
    });
  });

  // ─── remove ─────────────────────────────────────────────────

  describe('remove', () => {
    it('should soft delete user (set deleted_at and is_active=false) and clear sessions', async () => {
      prisma.users.findFirst.mockResolvedValue(mockUser);
      prisma.users.update.mockResolvedValue({});
      prisma.user_sessions.deleteMany.mockResolvedValue({});

      const result = await service.remove(USER_ID);

      expect(prisma.users.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { deleted_at: expect.any(Date), is_active: false },
      });
      expect(prisma.user_sessions.deleteMany).toHaveBeenCalledWith({ where: { user_id: USER_ID } });
      expect(result).toEqual({ message: 'Usuario eliminado exitosamente' });
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.users.findFirst.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should not delete already soft-deleted users (filtered by deleted_at: null)', async () => {
      prisma.users.findFirst.mockResolvedValue(null);

      await expect(service.remove(USER_ID)).rejects.toThrow(NotFoundException);
      expect(prisma.users.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: USER_ID, deleted_at: null } }),
      );
    });
  });

  // ─── changePassword ─────────────────────────────────────────

  describe('changePassword', () => {
    beforeEach(() => {
      prisma.users.findFirst.mockResolvedValue(mockUser);
      prisma.password_history.findMany.mockResolvedValue([]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed');
      prisma.password_history.create.mockResolvedValue({});
      prisma.users.update.mockResolvedValue({});
    });

    it('should change password successfully', async () => {
      const result = await service.changePassword(USER_ID, { new_password: 'NewPass123!' }, ASSIGNED_BY);

      expect(bcrypt.hash).toHaveBeenCalledWith('NewPass123!', 12);
      expect(prisma.password_history.create).toHaveBeenCalledWith({
        data: {
          user_id: USER_ID,
          password_hash: 'hashed-password',
          changed_by: ASSIGNED_BY,
        },
      });
      expect(prisma.users.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { password_hash: 'new-hashed' },
      });
      expect(result).toEqual({ message: 'Contrasena actualizada exitosamente' });
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.users.findFirst.mockResolvedValue(null);

      await expect(
        service.changePassword('nonexistent', { new_password: 'x' }, ASSIGNED_BY),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject password matching current hash', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.changePassword(USER_ID, { new_password: 'same-password' }, ASSIGNED_BY),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject password matching one from history', async () => {
      prisma.password_history.findMany.mockResolvedValue([
        { password_hash: 'old-hash-1' },
        { password_hash: 'old-hash-2' },
      ]);
      (bcrypt.compare as jest.Mock)
        .mockResolvedValueOnce(false)  // current hash
        .mockResolvedValueOnce(true);  // old-hash-1 matches

      await expect(
        service.changePassword(USER_ID, { new_password: 'reused-pass' }, ASSIGNED_BY),
      ).rejects.toThrow(BadRequestException);
    });

    it('should check up to 5 history entries', async () => {
      await service.changePassword(USER_ID, { new_password: 'new' }, ASSIGNED_BY);

      expect(prisma.password_history.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
    });
  });

  // ─── toggleStatus ───────────────────────────────────────────

  describe('toggleStatus', () => {
    it('should toggle from active to inactive', async () => {
      prisma.users.findFirst.mockResolvedValue({ ...mockUser, is_active: true });
      prisma.users.update.mockResolvedValue({ id: USER_ID, is_active: false });

      const result = await service.toggleStatus(USER_ID);

      expect(prisma.users.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { is_active: false },
        select: { id: true, is_active: true },
      });
      expect(result).toEqual({ message: 'Usuario desactivado', is_active: false });
    });

    it('should toggle from inactive to active', async () => {
      prisma.users.findFirst.mockResolvedValue({ ...mockUser, is_active: false });
      prisma.users.update.mockResolvedValue({ id: USER_ID, is_active: true });

      const result = await service.toggleStatus(USER_ID);

      expect(prisma.users.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { is_active: true },
        select: { id: true, is_active: true },
      });
      expect(result).toEqual({ message: 'Usuario activado', is_active: true });
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.users.findFirst.mockResolvedValue(null);

      await expect(service.toggleStatus('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getUserRoles ───────────────────────────────────────────

  describe('getUserRoles', () => {
    it('should return formatted roles with dates', async () => {
      const assignedAt = new Date();
      const expiresAt = new Date('2030-01-01');
      prisma.users.findFirst.mockResolvedValue({
        user_roles: [
          { assigned_at: assignedAt, expires_at: expiresAt, role: { id: 'role-1', name: 'admin', description: 'Admin role' } },
        ],
      });

      const result = await service.getUserRoles(USER_ID);

      expect(result).toEqual([
        { id: 'role-1', name: 'admin', description: 'Admin role', assigned_at: assignedAt, expires_at: expiresAt },
      ]);
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.users.findFirst.mockResolvedValue(null);

      await expect(service.getUserRoles('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── assignRoles ────────────────────────────────────────────

  describe('assignRoles', () => {
    it('should assign roles successfully', async () => {
      prisma.users.findFirst.mockResolvedValue(mockUser);
      prisma.roles.findMany.mockResolvedValue([{ id: 'role-1' }, { id: 'role-2' }]);
      prisma.user_roles.createMany.mockResolvedValue({ count: 2 });

      const result = await service.assignRoles(USER_ID, { role_ids: ['role-1', 'role-2'] }, ASSIGNED_BY);

      expect(prisma.roles.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['role-1', 'role-2'] }, is_active: true },
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
      prisma.users.findFirst.mockResolvedValue(mockUser);
      prisma.roles.findMany.mockResolvedValue([{ id: 'role-1' }]);

      await expect(
        service.assignRoles(USER_ID, { role_ids: ['role-1', 'role-nonexistent'] }, ASSIGNED_BY),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.users.findFirst.mockResolvedValue(null);

      await expect(
        service.assignRoles('nonexistent', { role_ids: ['role-1'] }, ASSIGNED_BY),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle expires_at when provided', async () => {
      prisma.users.findFirst.mockResolvedValue(mockUser);
      prisma.roles.findMany.mockResolvedValue([{ id: 'role-1' }]);
      prisma.user_roles.createMany.mockResolvedValue({ count: 1 });

      await service.assignRoles(
        USER_ID,
        { role_ids: ['role-1'], expires_at: '2030-12-31' },
        ASSIGNED_BY,
      );

      expect(prisma.user_roles.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ expires_at: new Date('2030-12-31') }),
        ],
        skipDuplicates: true,
      });
    });
  });

  // ─── removeRole ─────────────────────────────────────────────

  describe('removeRole', () => {
    it('should remove role from user', async () => {
      prisma.users.findFirst.mockResolvedValue(mockUser);
      prisma.user_roles.delete.mockResolvedValue({});

      const result = await service.removeRole(USER_ID, 'role-1');

      expect(prisma.user_roles.delete).toHaveBeenCalledWith({
        where: { user_id_role_id: { user_id: USER_ID, role_id: 'role-1' } },
      });
      expect(result).toEqual({ message: 'Rol removido exitosamente' });
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.users.findFirst.mockResolvedValue(null);

      await expect(service.removeRole('nonexistent', 'role-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getUserPermissions ─────────────────────────────────────

  describe('getUserPermissions', () => {
    it('should combine role and extra permissions without duplicates', async () => {
      prisma.users.findFirst.mockResolvedValue(mockUser);
      prisma.$queryRaw.mockResolvedValue([
        { permission_id: 'perm-1', module: 'users', submodule: 'manage', action: 'read' },
      ]);
      prisma.user_permissions.findMany.mockResolvedValue([
        { permission: { id: 'perm-1', module: 'users', submodule: 'manage', action: 'read' } },
        { permission: { id: 'perm-2', module: 'users', submodule: 'manage', action: 'write' } },
      ]);

      const result = await service.getUserPermissions(USER_ID);

      // perm-1 appears from both sources but should only appear once (from role)
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

      await expect(service.getUserPermissions('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── assignExtraPermissions ─────────────────────────────────

  describe('assignExtraPermissions', () => {
    it('should assign extra permissions successfully', async () => {
      prisma.users.findFirst.mockResolvedValue(mockUser);
      prisma.permissions.findMany.mockResolvedValue([{ id: 'perm-1' }, { id: 'perm-2' }]);
      prisma.user_permissions.createMany.mockResolvedValue({ count: 2 });

      const result = await service.assignExtraPermissions(
        USER_ID,
        { permission_ids: ['perm-1', 'perm-2'] },
        ASSIGNED_BY,
      );

      expect(prisma.permissions.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['perm-1', 'perm-2'] } },
      });
      expect(prisma.user_permissions.createMany).toHaveBeenCalledWith({
        data: [
          { user_id: USER_ID, permission_id: 'perm-1', granted_by: ASSIGNED_BY },
          { user_id: USER_ID, permission_id: 'perm-2', granted_by: ASSIGNED_BY },
        ],
        skipDuplicates: true,
      });
      expect(result).toEqual({ message: 'Permisos extra asignados exitosamente' });
    });

    it('should throw NotFoundException when permission not found', async () => {
      prisma.users.findFirst.mockResolvedValue(mockUser);
      prisma.permissions.findMany.mockResolvedValue([{ id: 'perm-1' }]);

      await expect(
        service.assignExtraPermissions(USER_ID, { permission_ids: ['perm-1', 'perm-nonexistent'] }, ASSIGNED_BY),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.users.findFirst.mockResolvedValue(null);

      await expect(
        service.assignExtraPermissions('nonexistent', { permission_ids: ['perm-1'] }, ASSIGNED_BY),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── removeExtraPermission ──────────────────────────────────

  describe('removeExtraPermission', () => {
    it('should remove an extra permission successfully', async () => {
      prisma.users.findFirst.mockResolvedValue(mockUser);
      prisma.user_permissions.delete.mockResolvedValue({});

      const result = await service.removeExtraPermission(USER_ID, 'perm-1');

      expect(prisma.user_permissions.delete).toHaveBeenCalledWith({
        where: { user_id_permission_id: { user_id: USER_ID, permission_id: 'perm-1' } },
      });
      expect(result).toEqual({ message: 'Permiso extra removido exitosamente' });
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.users.findFirst.mockResolvedValue(null);

      await expect(
        service.removeExtraPermission('nonexistent', 'perm-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── replaceExtraPermissions ────────────────────────────────

  describe('replaceExtraPermissions', () => {
    it('should delete all existing and create new permissions', async () => {
      prisma.users.findFirst.mockResolvedValue(mockUser);
      prisma.permissions.findMany.mockResolvedValue([{ id: 'perm-3' }, { id: 'perm-4' }]);
      prisma.user_permissions.deleteMany.mockResolvedValue({});
      prisma.user_permissions.createMany.mockResolvedValue({ count: 2 });

      const result = await service.replaceExtraPermissions(
        USER_ID,
        { permission_ids: ['perm-3', 'perm-4'] },
        ASSIGNED_BY,
      );

      expect(prisma.user_permissions.deleteMany).toHaveBeenCalledWith({ where: { user_id: USER_ID } });
      expect(prisma.user_permissions.createMany).toHaveBeenCalledWith({
        data: [
          { user_id: USER_ID, permission_id: 'perm-3', granted_by: ASSIGNED_BY },
          { user_id: USER_ID, permission_id: 'perm-4', granted_by: ASSIGNED_BY },
        ],
      });
      expect(result).toEqual({ message: 'Permisos extra actualizados exitosamente' });
    });

    it('should clear all permissions when given empty array', async () => {
      prisma.users.findFirst.mockResolvedValue(mockUser);
      prisma.user_permissions.deleteMany.mockResolvedValue({});

      const result = await service.replaceExtraPermissions(USER_ID, { permission_ids: [] }, ASSIGNED_BY);

      expect(prisma.user_permissions.deleteMany).toHaveBeenCalledWith({ where: { user_id: USER_ID } });
      expect(prisma.user_permissions.createMany).not.toHaveBeenCalled();
      expect(result).toEqual({ message: 'Permisos extra actualizados exitosamente' });
    });

    it('should throw NotFoundException when permission not found', async () => {
      prisma.users.findFirst.mockResolvedValue(mockUser);
      prisma.permissions.findMany.mockResolvedValue([{ id: 'perm-3' }]);

      await expect(
        service.replaceExtraPermissions(USER_ID, { permission_ids: ['perm-3', 'perm-nonexistent'] }, ASSIGNED_BY),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.users.findFirst.mockResolvedValue(null);

      await expect(
        service.replaceExtraPermissions('nonexistent', { permission_ids: ['perm-1'] }, ASSIGNED_BY),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getAreas ───────────────────────────────────────────────

  describe('getAreas', () => {
    it('should return active areas sorted by name', async () => {
      const areas = [{ id: 'area-1', name: 'Engineering' }, { id: 'area-2', name: 'HR' }];
      prisma.areas.findMany.mockResolvedValue(areas);

      const result = await service.getAreas();

      expect(prisma.areas.findMany).toHaveBeenCalledWith({
        where: { is_active: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual(areas);
    });
  });

  // ─── getSedes ───────────────────────────────────────────────

  describe('getSedes', () => {
    it('should return active sedes sorted by name', async () => {
      const sedes = [{ id: 'sede-1', name: 'Bogota' }, { id: 'sede-2', name: 'Medellin' }];
      prisma.sedes.findMany.mockResolvedValue(sedes);

      const result = await service.getSedes();

      expect(prisma.sedes.findMany).toHaveBeenCalledWith({
        where: { is_active: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual(sedes);
    });
  });
});
