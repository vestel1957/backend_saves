import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ConflictException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';

// Mock otplib
jest.mock('otplib', () => ({
  generateSecret: jest.fn(() => 'MOCK_TOTP_SECRET'),
  generateURI: jest.fn(() => 'otpauth://totp/App:test@test.com?secret=MOCK_TOTP_SECRET'),
  verify: jest.fn(),
}));

// Mock qrcode
jest.mock('qrcode', () => ({
  toDataURL: jest.fn(() => Promise.resolve('data:image/png;base64,MOCKQR')),
}));

// Mock bcrypt
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(() => Promise.resolve('$2b$12$newhashedpassword')),
}));

const { verify: otpVerify } = require('otplib');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let jwtService: any;
  let emailService: any;

  const mockUser = {
    id: 'user-uuid-1',
    email: 'test@example.com',
    password_hash: '$2b$12$hashedpassword',
    is_active: true,
    is_super_admin: false,
    is_2fa_enabled: false,
    totp_secret: null,
    deleted_at: null,
    first_name: 'John',
  };

  const mockLoginData = {
    email: 'test@example.com',
    password: 'ValidPass123!',
    ip_address: '127.0.0.1',
    user_agent: 'jest-test',
  };

  beforeEach(async () => {
    prisma = {
      users: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      login_attempts: {
        count: jest.fn(),
        create: jest.fn(),
      },
      user_sessions: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      password_reset_codes: {
        findFirst: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        update: jest.fn(),
      },
      password_history: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      permissions: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    jwtService = {
      sign: jest.fn(() => 'mock-access-token'),
      verify: jest.fn(),
    };

    emailService = {
      sendResetCode: jest.fn(() => Promise.resolve()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════
  // LOGIN
  // ═══════════════════════════════════════════════════════════════
  describe('login', () => {
    it('should return tokens on valid credentials', async () => {
      prisma.users.findUnique.mockResolvedValue(mockUser);
      prisma.login_attempts.count.mockResolvedValue(0);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      prisma.login_attempts.create.mockResolvedValue({});
      prisma.user_sessions.create.mockResolvedValue({});
      prisma.users.update.mockResolvedValue({});

      const result = await service.login(mockLoginData);

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(prisma.users.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: mockLoginData.email } }),
      );
      expect(prisma.user_sessions.create).toHaveBeenCalled();
      expect(prisma.users.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockUser.id },
          data: expect.objectContaining({ last_login_at: expect.any(Date) }),
        }),
      );
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      prisma.users.findUnique.mockResolvedValue(null);
      prisma.login_attempts.create.mockResolvedValue({});

      await expect(service.login(mockLoginData)).rejects.toThrow(UnauthorizedException);
      expect(prisma.login_attempts.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ success: false, failure_reason: 'user_not_found' }),
        }),
      );
    });

    it('should throw UnauthorizedException when user is inactive', async () => {
      prisma.users.findUnique.mockResolvedValue({ ...mockUser, is_active: false });
      prisma.login_attempts.create.mockResolvedValue({});

      await expect(service.login(mockLoginData)).rejects.toThrow(UnauthorizedException);
      expect(prisma.login_attempts.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ failure_reason: 'account_disabled' }),
        }),
      );
    });

    it('should throw UnauthorizedException when user is soft-deleted', async () => {
      prisma.users.findUnique.mockResolvedValue({ ...mockUser, deleted_at: new Date() });
      prisma.login_attempts.create.mockResolvedValue({});

      await expect(service.login(mockLoginData)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException on invalid password', async () => {
      prisma.users.findUnique.mockResolvedValue(mockUser);
      prisma.login_attempts.count.mockResolvedValue(0);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      prisma.login_attempts.create.mockResolvedValue({});

      await expect(service.login(mockLoginData)).rejects.toThrow(UnauthorizedException);
      expect(prisma.login_attempts.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ failure_reason: 'invalid_password' }),
        }),
      );
    });

    it('should throw ForbiddenException after 5 failed attempts', async () => {
      prisma.users.findUnique.mockResolvedValue(mockUser);
      prisma.login_attempts.count.mockResolvedValue(5);
      prisma.login_attempts.create.mockResolvedValue({});

      await expect(service.login(mockLoginData)).rejects.toThrow(ForbiddenException);
      expect(prisma.login_attempts.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ failure_reason: 'account_locked' }),
        }),
      );
    });

    it('should return requires_2fa when 2FA is enabled', async () => {
      const userWith2fa = { ...mockUser, is_2fa_enabled: true, totp_secret: 'SECRET' };
      prisma.users.findUnique.mockResolvedValue(userWith2fa);
      prisma.login_attempts.count.mockResolvedValue(0);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      prisma.login_attempts.create.mockResolvedValue({});

      jwtService.sign.mockReturnValue('temp-2fa-token');

      const result = await service.login(mockLoginData);

      expect(result).toEqual({
        requires_2fa: true,
        temp_token: 'temp-2fa-token',
      });
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: mockUser.id, requires_2fa: true }),
        { expiresIn: '5m' },
      );
      // Should NOT create a session yet
      expect(prisma.user_sessions.create).not.toHaveBeenCalled();
    });

    it('should record successful login attempt', async () => {
      prisma.users.findUnique.mockResolvedValue(mockUser);
      prisma.login_attempts.count.mockResolvedValue(0);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      prisma.login_attempts.create.mockResolvedValue({});
      prisma.user_sessions.create.mockResolvedValue({});
      prisma.users.update.mockResolvedValue({});

      await service.login(mockLoginData);

      expect(prisma.login_attempts.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: mockLoginData.email,
            success: true,
          }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // REFRESH TOKENS
  // ═══════════════════════════════════════════════════════════════
  describe('refreshTokens', () => {
    const refreshToken = 'valid-refresh-token';

    it('should rotate tokens on valid refresh token', async () => {
      const mockSession = {
        id: 'session-1',
        expires_at: new Date(Date.now() + 86400000),
        ip_address: '127.0.0.1',
        user_agent: 'jest',
        user: { id: 'user-uuid-1', is_active: true, is_super_admin: false, deleted_at: null },
      };

      prisma.$transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          user_sessions: {
            findUnique: jest.fn().mockResolvedValue(mockSession),
            delete: jest.fn().mockResolvedValue({}),
            create: jest.fn().mockResolvedValue({}),
          },
        };
        return cb(tx);
      });

      const result = await service.refreshTokens(refreshToken);

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
    });

    it('should throw UnauthorizedException when session not found', async () => {
      prisma.$transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          user_sessions: {
            findUnique: jest.fn().mockResolvedValue(null),
          },
        };
        return cb(tx);
      });

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when session is expired and delete it', async () => {
      const expiredSession = {
        id: 'session-1',
        expires_at: new Date(Date.now() - 86400000),
        user: { id: 'user-uuid-1', is_active: true, is_super_admin: false, deleted_at: null },
      };

      prisma.$transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          user_sessions: {
            findUnique: jest.fn().mockResolvedValue(expiredSession),
            delete: jest.fn().mockResolvedValue({}),
          },
        };
        return cb(tx);
      });

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ForbiddenException when user account is deactivated', async () => {
      const sessionWithInactiveUser = {
        id: 'session-1',
        expires_at: new Date(Date.now() + 86400000),
        user: { id: 'user-uuid-1', is_active: false, is_super_admin: false, deleted_at: null },
      };

      prisma.$transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          user_sessions: {
            findUnique: jest.fn().mockResolvedValue(sessionWithInactiveUser),
            delete: jest.fn().mockResolvedValue({}),
          },
        };
        return cb(tx);
      });

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user is soft-deleted', async () => {
      const sessionWithDeletedUser = {
        id: 'session-1',
        expires_at: new Date(Date.now() + 86400000),
        user: { id: 'user-uuid-1', is_active: true, is_super_admin: false, deleted_at: new Date() },
      };

      prisma.$transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          user_sessions: {
            findUnique: jest.fn().mockResolvedValue(sessionWithDeletedUser),
            delete: jest.fn().mockResolvedValue({}),
          },
        };
        return cb(tx);
      });

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(ForbiddenException);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // LOGOUT
  // ═══════════════════════════════════════════════════════════════
  describe('logout', () => {
    it('should delete session and return success message', async () => {
      const refreshToken = 'some-refresh-token';
      const userId = 'user-uuid-1';
      const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

      prisma.user_sessions.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.logout(refreshToken, userId);

      expect(result).toEqual({ message: 'Sesion cerrada exitosamente' });
      expect(prisma.user_sessions.deleteMany).toHaveBeenCalledWith({
        where: { token_hash: tokenHash, user_id: userId },
      });
    });

    it('should throw UnauthorizedException when session not found', async () => {
      prisma.user_sessions.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.logout('bad-token', 'user-uuid-1')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // LOGOUT ALL
  // ═══════════════════════════════════════════════════════════════
  describe('logoutAll', () => {
    it('should delete all sessions for a user', async () => {
      prisma.user_sessions.deleteMany.mockResolvedValue({ count: 3 });

      const result = await service.logoutAll('user-uuid-1');

      expect(result).toEqual({ message: 'Todas las sesiones cerradas exitosamente' });
      expect(prisma.user_sessions.deleteMany).toHaveBeenCalledWith({
        where: { user_id: 'user-uuid-1' },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // GET SESSIONS
  // ═══════════════════════════════════════════════════════════════
  describe('getSessions', () => {
    it('should return active sessions for a user', async () => {
      const sessions = [
        {
          id: 's1',
          ip_address: '127.0.0.1',
          user_agent: 'Chrome',
          created_at: new Date(),
          expires_at: new Date(Date.now() + 86400000),
        },
        {
          id: 's2',
          ip_address: '10.0.0.1',
          user_agent: 'Firefox',
          created_at: new Date(),
          expires_at: new Date(Date.now() + 86400000),
        },
      ];
      prisma.user_sessions.findMany.mockResolvedValue(sessions);

      const result = await service.getSessions('user-uuid-1');

      expect(result).toEqual(sessions);
      expect(prisma.user_sessions.findMany).toHaveBeenCalledWith({
        where: {
          user_id: 'user-uuid-1',
          expires_at: { gt: expect.any(Date) },
        },
        select: {
          id: true,
          ip_address: true,
          user_agent: true,
          created_at: true,
          expires_at: true,
        },
        orderBy: { created_at: 'desc' },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // FORGOT PASSWORD
  // ═══════════════════════════════════════════════════════════════
  describe('forgotPassword', () => {
    const expectedMessage = 'Si el correo existe, recibiras un codigo de verificacion';

    it('should return same message even if user does not exist (security)', async () => {
      prisma.users.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword('nonexistent@test.com');

      expect(result).toEqual({ message: expectedMessage });
      expect(prisma.password_reset_codes.create).not.toHaveBeenCalled();
      expect(emailService.sendResetCode).not.toHaveBeenCalled();
    });

    it('should create reset code and send email when user exists', async () => {
      prisma.users.findUnique.mockResolvedValue(mockUser);
      prisma.password_reset_codes.deleteMany.mockResolvedValue({});
      prisma.password_reset_codes.create.mockResolvedValue({});

      const result = await service.forgotPassword('test@example.com');

      expect(result).toEqual({ message: expectedMessage });
      expect(prisma.password_reset_codes.deleteMany).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(prisma.password_reset_codes.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          user_id: mockUser.id,
          email: 'test@example.com',
          code: expect.stringMatching(/^\d{6}$/),
          expires_at: expect.any(Date),
        }),
      });
      expect(emailService.sendResetCode).toHaveBeenCalledWith(
        'test@example.com',
        expect.stringMatching(/^\d{6}$/),
        'John',
      );
    });

    it('should return same message for inactive user (security)', async () => {
      prisma.users.findUnique.mockResolvedValue({ ...mockUser, is_active: false });

      const result = await service.forgotPassword('test@example.com');

      expect(result).toEqual({ message: expectedMessage });
      expect(prisma.password_reset_codes.create).not.toHaveBeenCalled();
      expect(emailService.sendResetCode).not.toHaveBeenCalled();
    });

    it('should return same message for soft-deleted user (security)', async () => {
      prisma.users.findUnique.mockResolvedValue({ ...mockUser, deleted_at: new Date() });

      const result = await service.forgotPassword('test@example.com');

      expect(result).toEqual({ message: expectedMessage });
      expect(prisma.password_reset_codes.create).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // VERIFY RESET CODE
  // ═══════════════════════════════════════════════════════════════
  describe('verifyResetCode', () => {
    it('should verify a valid code successfully', async () => {
      prisma.password_reset_codes.findFirst.mockResolvedValue({
        id: 'rc-1',
        code: '123456',
        attempts: 0,
        expires_at: new Date(Date.now() + 300000),
      });
      prisma.password_reset_codes.update.mockResolvedValue({});

      const result = await service.verifyResetCode('test@example.com', '123456');

      expect(result).toEqual({ message: 'Codigo verificado correctamente', verified: true });
      // Should increment attempts first, then set is_verified
      expect(prisma.password_reset_codes.update).toHaveBeenCalledTimes(2);
      expect(prisma.password_reset_codes.update).toHaveBeenCalledWith({
        where: { id: 'rc-1' },
        data: { attempts: { increment: 1 } },
      });
      expect(prisma.password_reset_codes.update).toHaveBeenCalledWith({
        where: { id: 'rc-1' },
        data: { is_verified: true },
      });
    });

    it('should throw UnauthorizedException when no code found', async () => {
      prisma.password_reset_codes.findFirst.mockResolvedValue(null);

      await expect(service.verifyResetCode('test@example.com', '000000')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when code is expired and delete it', async () => {
      prisma.password_reset_codes.findFirst.mockResolvedValue({
        id: 'rc-1',
        code: '123456',
        attempts: 0,
        expires_at: new Date(Date.now() - 60000),
      });
      prisma.password_reset_codes.delete.mockResolvedValue({});

      await expect(service.verifyResetCode('test@example.com', '123456')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.password_reset_codes.delete).toHaveBeenCalledWith({
        where: { id: 'rc-1' },
      });
    });

    it('should throw ForbiddenException after 5 attempts and delete code', async () => {
      prisma.password_reset_codes.findFirst.mockResolvedValue({
        id: 'rc-1',
        code: '123456',
        attempts: 5,
        expires_at: new Date(Date.now() + 300000),
      });
      prisma.password_reset_codes.delete.mockResolvedValue({});

      await expect(service.verifyResetCode('test@example.com', '123456')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.password_reset_codes.delete).toHaveBeenCalledWith({
        where: { id: 'rc-1' },
      });
    });

    it('should throw UnauthorizedException on wrong code but still increment attempts', async () => {
      prisma.password_reset_codes.findFirst.mockResolvedValue({
        id: 'rc-1',
        code: '123456',
        attempts: 2,
        expires_at: new Date(Date.now() + 300000),
      });
      prisma.password_reset_codes.update.mockResolvedValue({});

      await expect(service.verifyResetCode('test@example.com', '999999')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.password_reset_codes.update).toHaveBeenCalledWith({
        where: { id: 'rc-1' },
        data: { attempts: { increment: 1 } },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // RESET PASSWORD
  // ═══════════════════════════════════════════════════════════════
  describe('resetPassword', () => {
    const resetCodeRecord = {
      id: 'rc-1',
      user_id: 'user-uuid-1',
      code: '123456',
      is_verified: true,
      expires_at: new Date(Date.now() + 300000),
    };

    it('should reset password successfully', async () => {
      prisma.password_reset_codes.findFirst.mockResolvedValue(resetCodeRecord);
      prisma.password_history.findMany.mockResolvedValue([]);
      prisma.users.findUnique.mockResolvedValue({ password_hash: '$2b$12$oldpasshash' });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$12$newhashedpw');

      prisma.$transaction.mockImplementation(async (cb: Function) => {
        const tx = {
          password_history: { create: jest.fn().mockResolvedValue({}) },
          users: { update: jest.fn().mockResolvedValue({}) },
          password_reset_codes: { deleteMany: jest.fn().mockResolvedValue({}) },
          user_sessions: { deleteMany: jest.fn().mockResolvedValue({}) },
        };
        return cb(tx);
      });

      const result = await service.resetPassword('test@example.com', '123456', 'NewPass456!');

      expect(result).toEqual({ message: 'Contrasena actualizada exitosamente' });
      expect(bcrypt.hash).toHaveBeenCalledWith('NewPass456!', 12);
    });

    it('should throw UnauthorizedException when reset code is not verified', async () => {
      prisma.password_reset_codes.findFirst.mockResolvedValue(null);

      await expect(
        service.resetPassword('test@example.com', '123456', 'NewPass456!'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when reset code is expired', async () => {
      prisma.password_reset_codes.findFirst.mockResolvedValue({
        ...resetCodeRecord,
        expires_at: new Date(Date.now() - 60000),
      });
      prisma.password_reset_codes.delete.mockResolvedValue({});

      await expect(
        service.resetPassword('test@example.com', '123456', 'NewPass456!'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ConflictException when new password matches current password', async () => {
      prisma.password_reset_codes.findFirst.mockResolvedValue(resetCodeRecord);
      prisma.password_history.findMany.mockResolvedValue([]);
      prisma.users.findUnique.mockResolvedValue({ password_hash: '$2b$12$currenthash' });
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true); // matches current

      await expect(
        service.resetPassword('test@example.com', '123456', 'ReusedPassword!'),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when new password matches password history', async () => {
      prisma.password_reset_codes.findFirst.mockResolvedValue(resetCodeRecord);
      prisma.password_history.findMany.mockResolvedValue([
        { password_hash: '$2b$12$oldhash1' },
        { password_hash: '$2b$12$oldhash2' },
      ]);
      prisma.users.findUnique.mockResolvedValue({ password_hash: '$2b$12$currenthash' });
      // Current password does not match, but second history entry does
      (bcrypt.compare as jest.Mock)
        .mockResolvedValueOnce(false) // current
        .mockResolvedValueOnce(false) // oldhash1
        .mockResolvedValueOnce(true); // oldhash2

      await expect(
        service.resetPassword('test@example.com', '123456', 'ReusedPassword!'),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // GET PROFILE
  // ═══════════════════════════════════════════════════════════════
  describe('getProfile', () => {
    it('should return all permissions for super_admin', async () => {
      prisma.users.findUnique.mockResolvedValue({
        id: 'user-uuid-1',
        email: 'admin@test.com',
        username: 'admin',
        first_name: 'Admin',
        last_name: 'User',
        avatar_url: null,
        is_active: true,
        is_verified: true,
        is_super_admin: true,
        last_login_at: new Date(),
        user_roles: [],
      });
      prisma.permissions.findMany.mockResolvedValue([
        { module: 'users', submodule: 'list', action: 'read' },
        { module: 'users', submodule: 'list', action: 'write' },
      ]);

      const result = await service.getProfile('user-uuid-1');

      expect(result.is_super_admin).toBe(true);
      expect(result.roles).toEqual([{ id: 'super_admin', name: 'Super Administrador' }]);
      expect(result.permissions).toEqual(['users.list.read', 'users.list.write']);
      expect(prisma.permissions.findMany).toHaveBeenCalledWith({
        select: { module: true, submodule: true, action: true },
      });
    });

    it('should return role-based permissions for normal user', async () => {
      prisma.users.findUnique.mockResolvedValue({
        id: 'user-uuid-2',
        email: 'user@test.com',
        username: 'user',
        first_name: 'Normal',
        last_name: 'User',
        avatar_url: null,
        is_active: true,
        is_verified: true,
        is_super_admin: false,
        last_login_at: new Date(),
        user_roles: [
          {
            role: {
              id: 'role-1',
              name: 'Editor',
              role_permissions: [
                { permission: { module: 'posts', submodule: 'articles', action: 'read' } },
                { permission: { module: 'posts', submodule: 'articles', action: 'write' } },
              ],
            },
          },
        ],
      });

      const result = await service.getProfile('user-uuid-2');

      expect(result.is_super_admin).toBe(false);
      expect(result.roles).toEqual([{ id: 'role-1', name: 'Editor' }]);
      expect(result.permissions).toContain('posts.articles.read');
      expect(result.permissions).toContain('posts.articles.write');
      // Should NOT call permissions.findMany for non-super-admin
      expect(prisma.permissions.findMany).not.toHaveBeenCalled();
    });

    it('should deduplicate permissions across multiple roles', async () => {
      prisma.users.findUnique.mockResolvedValue({
        id: 'user-uuid-3',
        email: 'multi@test.com',
        username: 'multi',
        first_name: 'Multi',
        last_name: 'Role',
        avatar_url: null,
        is_active: true,
        is_verified: true,
        is_super_admin: false,
        last_login_at: new Date(),
        user_roles: [
          {
            role: {
              id: 'role-1',
              name: 'Editor',
              role_permissions: [
                { permission: { module: 'posts', submodule: 'articles', action: 'read' } },
              ],
            },
          },
          {
            role: {
              id: 'role-2',
              name: 'Viewer',
              role_permissions: [
                { permission: { module: 'posts', submodule: 'articles', action: 'read' } }, // duplicate
                { permission: { module: 'dashboard', submodule: 'stats', action: 'read' } },
              ],
            },
          },
        ],
      });

      const result = await service.getProfile('user-uuid-3');

      expect(result.permissions).toHaveLength(2); // deduplicated
      expect(result.roles).toHaveLength(2);
    });

    it('should throw UnauthorizedException when user not found', async () => {
      prisma.users.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('nonexistent-id')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 2FA SETUP
  // ═══════════════════════════════════════════════════════════════
  describe('setup2fa', () => {
    it('should return secret and QR code', async () => {
      prisma.users.findUnique.mockResolvedValue({
        email: 'test@example.com',
        is_2fa_enabled: false,
        totp_secret: null,
      });
      prisma.users.update.mockResolvedValue({});

      const result = await service.setup2fa('user-uuid-1');

      expect(result).toHaveProperty('secret');
      expect(result).toHaveProperty('qr_code');
      expect(result).toHaveProperty('message');
      expect(prisma.users.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-uuid-1' },
          data: { totp_secret: expect.any(String) },
        }),
      );
    });

    it('should throw UnauthorizedException if user not found', async () => {
      prisma.users.findUnique.mockResolvedValue(null);

      await expect(service.setup2fa('bad-id')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ConflictException if 2FA already enabled', async () => {
      prisma.users.findUnique.mockResolvedValue({
        email: 'test@example.com',
        is_2fa_enabled: true,
        totp_secret: 'SECRET',
      });

      await expect(service.setup2fa('user-uuid-1')).rejects.toThrow(ConflictException);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 2FA VERIFY (activate)
  // ═══════════════════════════════════════════════════════════════
  describe('verify2fa', () => {
    it('should activate 2FA on valid code', async () => {
      prisma.users.findUnique.mockResolvedValue({
        totp_secret: 'SECRET',
        is_2fa_enabled: false,
      });
      (otpVerify as jest.Mock).mockResolvedValue({ valid: true });
      prisma.users.update.mockResolvedValue({});

      const result = await service.verify2fa('user-uuid-1', '123456');

      expect(result).toEqual({ message: '2FA activado exitosamente' });
      expect(prisma.users.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { is_2fa_enabled: true },
        }),
      );
    });

    it('should throw UnauthorizedException on invalid code', async () => {
      prisma.users.findUnique.mockResolvedValue({
        totp_secret: 'SECRET',
        is_2fa_enabled: false,
      });
      (otpVerify as jest.Mock).mockResolvedValue({ valid: false });

      await expect(service.verify2fa('user-uuid-1', '000000')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if no totp_secret set', async () => {
      prisma.users.findUnique.mockResolvedValue({
        totp_secret: null,
        is_2fa_enabled: false,
      });

      await expect(service.verify2fa('user-uuid-1', '123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if user not found', async () => {
      prisma.users.findUnique.mockResolvedValue(null);

      await expect(service.verify2fa('bad-id', '123456')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 2FA DISABLE
  // ═══════════════════════════════════════════════════════════════
  describe('disable2fa', () => {
    it('should disable 2FA on valid code', async () => {
      prisma.users.findUnique.mockResolvedValue({
        totp_secret: 'SECRET',
        is_2fa_enabled: true,
      });
      (otpVerify as jest.Mock).mockResolvedValue({ valid: true });
      prisma.users.update.mockResolvedValue({});

      const result = await service.disable2fa('user-uuid-1', '123456');

      expect(result).toEqual({ message: '2FA desactivado exitosamente' });
      expect(prisma.users.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { is_2fa_enabled: false, totp_secret: null },
        }),
      );
    });

    it('should throw UnauthorizedException if 2FA is not enabled', async () => {
      prisma.users.findUnique.mockResolvedValue({
        totp_secret: null,
        is_2fa_enabled: false,
      });

      await expect(service.disable2fa('user-uuid-1', '123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException on invalid code', async () => {
      prisma.users.findUnique.mockResolvedValue({
        totp_secret: 'SECRET',
        is_2fa_enabled: true,
      });
      (otpVerify as jest.Mock).mockResolvedValue({ valid: false });

      await expect(service.disable2fa('user-uuid-1', '000000')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 2FA LOGIN VERIFY
  // ═══════════════════════════════════════════════════════════════
  describe('verifyLogin2fa', () => {
    it('should return tokens on valid 2FA login', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-uuid-1',
        requires_2fa: true,
        ip_address: '127.0.0.1',
        user_agent: 'jest',
      });
      prisma.users.findUnique.mockResolvedValue({
        id: 'user-uuid-1',
        totp_secret: 'SECRET',
        is_super_admin: false,
      });
      (otpVerify as jest.Mock).mockResolvedValue({ valid: true });
      prisma.user_sessions.create.mockResolvedValue({});

      const result = await service.verifyLogin2fa('temp-token', '123456');

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(prisma.user_sessions.create).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException on invalid temp token', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(service.verifyLogin2fa('bad-token', '123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if token is not 2FA type', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-uuid-1',
        requires_2fa: false,
      });

      await expect(service.verifyLogin2fa('non-2fa-token', '123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException on invalid 2FA code', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-uuid-1',
        requires_2fa: true,
        ip_address: '127.0.0.1',
        user_agent: 'jest',
      });
      prisma.users.findUnique.mockResolvedValue({
        id: 'user-uuid-1',
        totp_secret: 'SECRET',
        is_super_admin: false,
      });
      (otpVerify as jest.Mock).mockResolvedValue({ valid: false });

      await expect(service.verifyLogin2fa('temp-token', '000000')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if user not found', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-uuid-1',
        requires_2fa: true,
      });
      prisma.users.findUnique.mockResolvedValue(null);

      await expect(service.verifyLogin2fa('temp-token', '123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if user has no totp_secret', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-uuid-1',
        requires_2fa: true,
      });
      prisma.users.findUnique.mockResolvedValue({
        id: 'user-uuid-1',
        totp_secret: null,
        is_super_admin: false,
      });

      await expect(service.verifyLogin2fa('temp-token', '123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
