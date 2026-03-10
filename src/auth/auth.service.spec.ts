import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import {
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let emailService: EmailService;

  const mockPrisma = {
    users: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    tenants: {
      findUnique: jest.fn(),
    },
    user_sessions: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    login_attempts: {
      create: jest.fn(),
    },
    password_reset_codes: {
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      update: jest.fn(),
    },
    password_history: {
      create: jest.fn(),
    },
    permissions: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-access-token'),
  };

  const mockEmailService = {
    sendResetCode: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
    emailService = module.get<EmailService>(EmailService);

    // Reset all mocks before each test
    jest.clearAllMocks();
    // Re-apply default return for jwtService.sign after clearAllMocks
    mockJwtService.sign.mockReturnValue('mock-access-token');
    mockEmailService.sendResetCode.mockResolvedValue(undefined);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════
  // REGISTER
  // ═══════════════════════════════════════════════════════════════
  describe('register', () => {
    const registerData = {
      email: 'test@example.com',
      username: 'testuser',
      password: 'Password123!',
      first_name: 'Test',
      last_name: 'User',
      tenant_id: 'tenant-1',
    };

    it('should register a user successfully', async () => {
      mockPrisma.users.findFirst.mockResolvedValue(null);
      mockPrisma.tenants.findUnique.mockResolvedValue({
        id: 'tenant-1',
        is_active: true,
      });
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      const createdUser = {
        id: 'user-1',
        email: registerData.email,
        username: registerData.username,
        first_name: registerData.first_name,
        last_name: registerData.last_name,
        tenant_id: registerData.tenant_id,
        is_active: true,
        created_at: new Date(),
      };
      mockPrisma.users.create.mockResolvedValue(createdUser);

      const result = await service.register(registerData);

      expect(result).toEqual({
        message: 'Usuario registrado exitosamente',
        user: createdUser,
      });
      expect(mockPrisma.users.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { email: registerData.email },
            { username: registerData.username },
          ],
        },
      });
      expect(mockPrisma.tenants.findUnique).toHaveBeenCalledWith({
        where: { id: registerData.tenant_id },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith(registerData.password, 12);
      expect(mockPrisma.users.create).toHaveBeenCalledWith({
        data: {
          email: registerData.email,
          username: registerData.username,
          password_hash: 'hashed-password',
          first_name: registerData.first_name,
          last_name: registerData.last_name,
          tenant_id: registerData.tenant_id,
        },
        select: {
          id: true,
          email: true,
          username: true,
          first_name: true,
          last_name: true,
          tenant_id: true,
          is_active: true,
          created_at: true,
        },
      });
    });

    it('should throw ConflictException when email already exists', async () => {
      mockPrisma.users.findFirst.mockResolvedValue({
        email: registerData.email,
        username: 'otheruser',
      });

      await expect(service.register(registerData)).rejects.toThrow(
        new ConflictException('El email ya está registrado'),
      );
      expect(mockPrisma.tenants.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.users.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when username already exists', async () => {
      mockPrisma.users.findFirst.mockResolvedValue({
        email: 'other@example.com',
        username: registerData.username,
      });

      await expect(service.register(registerData)).rejects.toThrow(
        new ConflictException('El username ya está en uso'),
      );
      expect(mockPrisma.tenants.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.users.create).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when tenant is inactive', async () => {
      mockPrisma.users.findFirst.mockResolvedValue(null);
      mockPrisma.tenants.findUnique.mockResolvedValue({
        id: 'tenant-1',
        is_active: false,
      });

      await expect(service.register(registerData)).rejects.toThrow(
        new ForbiddenException('Tenant no encontrado o inactivo'),
      );
      expect(mockPrisma.users.create).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when tenant is not found', async () => {
      mockPrisma.users.findFirst.mockResolvedValue(null);
      mockPrisma.tenants.findUnique.mockResolvedValue(null);

      await expect(service.register(registerData)).rejects.toThrow(
        new ForbiddenException('Tenant no encontrado o inactivo'),
      );
      expect(mockPrisma.users.create).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // LOGIN
  // ═══════════════════════════════════════════════════════════════
  describe('login', () => {
    const loginData = {
      email: 'test@example.com',
      password: 'Password123!',
      ip_address: '192.168.1.1',
      user_agent: 'Mozilla/5.0',
    };

    const mockUser = {
      id: 'user-1',
      email: loginData.email,
      username: 'testuser',
      password_hash: 'hashed-password',
      is_active: true,
      is_super_admin: false,
      tenant_id: 'tenant-1',
      tenant: { id: 'tenant-1', name: 'Test Tenant' },
    };

    it('should login successfully and return tokens', async () => {
      mockPrisma.users.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrisma.login_attempts.create.mockResolvedValue({});
      mockPrisma.user_sessions.create.mockResolvedValue({});
      mockPrisma.users.update.mockResolvedValue({});

      const result = await service.login(loginData);

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result.access_token).toBe('mock-access-token');
      expect(typeof result.refresh_token).toBe('string');
      expect(mockPrisma.users.findUnique).toHaveBeenCalledWith({
        where: { email: loginData.email },
        include: { tenant: true },
      });
      expect(bcrypt.compare).toHaveBeenCalledWith(
        loginData.password,
        mockUser.password_hash,
      );
      // Verify login attempt was recorded as successful
      expect(mockPrisma.login_attempts.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: loginData.email,
            success: true,
          }),
        }),
      );
      // Verify session was created
      expect(mockPrisma.user_sessions.create).toHaveBeenCalled();
      // Verify last_login_at was updated
      expect(mockPrisma.users.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { last_login_at: expect.any(Date) },
      });
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      mockPrisma.users.findUnique.mockResolvedValue(null);
      mockPrisma.login_attempts.create.mockResolvedValue({});

      await expect(service.login(loginData)).rejects.toThrow(
        new UnauthorizedException('Credenciales inválidas'),
      );
      expect(mockPrisma.login_attempts.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            success: false,
            failure_reason: 'user_not_found',
          }),
        }),
      );
    });

    it('should throw UnauthorizedException when password is wrong', async () => {
      mockPrisma.users.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      mockPrisma.login_attempts.create.mockResolvedValue({});

      await expect(service.login(loginData)).rejects.toThrow(
        new UnauthorizedException('Credenciales inválidas'),
      );
      expect(mockPrisma.login_attempts.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            success: false,
            failure_reason: 'invalid_password',
          }),
        }),
      );
    });

    it('should throw UnauthorizedException when account is inactive', async () => {
      mockPrisma.users.findUnique.mockResolvedValue({
        ...mockUser,
        is_active: false,
      });
      mockPrisma.login_attempts.create.mockResolvedValue({});

      await expect(service.login(loginData)).rejects.toThrow(
        new UnauthorizedException('Credenciales inválidas'),
      );
      expect(mockPrisma.login_attempts.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            success: false,
            failure_reason: 'account_disabled',
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
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

    const mockSession = {
      id: 'session-1',
      token_hash: tokenHash,
      user_id: 'user-1',
      ip_address: '192.168.1.1',
      user_agent: 'Mozilla/5.0',
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // future
      user: {
        id: 'user-1',
        is_active: true,
        is_super_admin: false,
        tenant_id: 'tenant-1',
      },
    };

    it('should refresh tokens successfully', async () => {
      mockPrisma.user_sessions.findUnique.mockResolvedValue(mockSession);
      mockPrisma.user_sessions.delete.mockResolvedValue({});
      mockPrisma.user_sessions.create.mockResolvedValue({});

      const result = await service.refreshTokens(refreshToken);

      expect(result).toHaveProperty('access_token', 'mock-access-token');
      expect(result).toHaveProperty('refresh_token');
      expect(typeof result.refresh_token).toBe('string');
      // Old session should be deleted (token rotation)
      expect(mockPrisma.user_sessions.delete).toHaveBeenCalledWith({
        where: { id: mockSession.id },
      });
      // New session should be created
      expect(mockPrisma.user_sessions.create).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when token is expired', async () => {
      const expiredSession = {
        ...mockSession,
        expires_at: new Date(Date.now() - 1000), // past
      };
      mockPrisma.user_sessions.findUnique.mockResolvedValue(expiredSession);
      mockPrisma.user_sessions.delete.mockResolvedValue({});

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(
        new UnauthorizedException('Refresh token inválido o expirado'),
      );
      // Expired session should be deleted
      expect(mockPrisma.user_sessions.delete).toHaveBeenCalledWith({
        where: { id: expiredSession.id },
      });
    });

    it('should throw UnauthorizedException when session is not found', async () => {
      mockPrisma.user_sessions.findUnique.mockResolvedValue(null);

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(
        new UnauthorizedException('Refresh token inválido o expirado'),
      );
    });

    it('should throw ForbiddenException when user is inactive', async () => {
      const inactiveUserSession = {
        ...mockSession,
        user: { ...mockSession.user, is_active: false },
      };
      mockPrisma.user_sessions.findUnique.mockResolvedValue(
        inactiveUserSession,
      );

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(
        new ForbiddenException('Cuenta desactivada'),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // LOGOUT
  // ═══════════════════════════════════════════════════════════════
  describe('logout', () => {
    it('should logout successfully', async () => {
      const refreshToken = 'some-refresh-token';
      const tokenHash = createHash('sha256')
        .update(refreshToken)
        .digest('hex');
      mockPrisma.user_sessions.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.logout(refreshToken);

      expect(result).toEqual({ message: 'Sesión cerrada exitosamente' });
      expect(mockPrisma.user_sessions.deleteMany).toHaveBeenCalledWith({
        where: { token_hash: tokenHash },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // LOGOUT ALL
  // ═══════════════════════════════════════════════════════════════
  describe('logoutAll', () => {
    it('should logout all sessions successfully', async () => {
      const userId = 'user-1';
      mockPrisma.user_sessions.deleteMany.mockResolvedValue({ count: 3 });

      const result = await service.logoutAll(userId);

      expect(result).toEqual({
        message: 'Todas las sesiones cerradas exitosamente',
      });
      expect(mockPrisma.user_sessions.deleteMany).toHaveBeenCalledWith({
        where: { user_id: userId },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // GET SESSIONS
  // ═══════════════════════════════════════════════════════════════
  describe('getSessions', () => {
    it('should return active sessions for the user', async () => {
      const userId = 'user-1';
      const mockSessions = [
        {
          id: 'session-1',
          ip_address: '192.168.1.1',
          user_agent: 'Chrome',
          created_at: new Date(),
          expires_at: new Date(Date.now() + 86400000),
        },
        {
          id: 'session-2',
          ip_address: '10.0.0.1',
          user_agent: 'Firefox',
          created_at: new Date(),
          expires_at: new Date(Date.now() + 86400000),
        },
      ];
      mockPrisma.user_sessions.findMany.mockResolvedValue(mockSessions);

      const result = await service.getSessions(userId);

      expect(result).toEqual(mockSessions);
      expect(mockPrisma.user_sessions.findMany).toHaveBeenCalledWith({
        where: {
          user_id: userId,
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
    const email = 'test@example.com';

    it('should generate a reset code and send email when user exists', async () => {
      const mockUser = {
        id: 'user-1',
        email,
        first_name: 'Test',
        is_active: true,
      };
      mockPrisma.users.findUnique.mockResolvedValue(mockUser);
      mockPrisma.password_reset_codes.deleteMany.mockResolvedValue({});
      mockPrisma.password_reset_codes.create.mockResolvedValue({});

      const result = await service.forgotPassword(email);

      expect(result).toEqual({
        message: 'Si el correo existe, recibirás un código de verificación',
      });
      expect(mockPrisma.users.findUnique).toHaveBeenCalledWith({
        where: { email },
      });
      // Should delete previous codes
      expect(mockPrisma.password_reset_codes.deleteMany).toHaveBeenCalledWith({
        where: { email },
      });
      // Should create a new code
      expect(mockPrisma.password_reset_codes.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          user_id: mockUser.id,
          email,
          code: expect.stringMatching(/^\d{6}$/),
          expires_at: expect.any(Date),
        }),
      });
      // Should send the email
      expect(mockEmailService.sendResetCode).toHaveBeenCalledWith(
        email,
        expect.stringMatching(/^\d{6}$/),
        'Test',
      );
    });

    it('should return generic message when user is not found (no information leak)', async () => {
      mockPrisma.users.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword(email);

      expect(result).toEqual({
        message: 'Si el correo existe, recibirás un código de verificación',
      });
      // Should NOT attempt to create codes or send emails
      expect(
        mockPrisma.password_reset_codes.deleteMany,
      ).not.toHaveBeenCalled();
      expect(mockPrisma.password_reset_codes.create).not.toHaveBeenCalled();
      expect(mockEmailService.sendResetCode).not.toHaveBeenCalled();
    });

    it('should return generic message when user is inactive', async () => {
      mockPrisma.users.findUnique.mockResolvedValue({
        id: 'user-1',
        email,
        is_active: false,
      });

      const result = await service.forgotPassword(email);

      expect(result).toEqual({
        message: 'Si el correo existe, recibirás un código de verificación',
      });
      expect(mockPrisma.password_reset_codes.create).not.toHaveBeenCalled();
      expect(mockEmailService.sendResetCode).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // VERIFY RESET CODE
  // ═══════════════════════════════════════════════════════════════
  describe('verifyResetCode', () => {
    const email = 'test@example.com';
    const code = '123456';

    it('should verify the code successfully', async () => {
      const mockResetCode = {
        id: 'reset-1',
        email,
        code,
        attempts: 0,
        is_verified: false,
        expires_at: new Date(Date.now() + 5 * 60 * 1000), // not expired
      };
      mockPrisma.password_reset_codes.findFirst.mockResolvedValue(
        mockResetCode,
      );
      mockPrisma.password_reset_codes.update.mockResolvedValue({});

      const result = await service.verifyResetCode(email, code);

      expect(result).toEqual({
        message: 'Código verificado correctamente',
        verified: true,
      });
      expect(mockPrisma.password_reset_codes.update).toHaveBeenCalledWith({
        where: { id: mockResetCode.id },
        data: { is_verified: true },
      });
    });

    it('should throw UnauthorizedException when code is invalid', async () => {
      mockPrisma.password_reset_codes.findFirst.mockResolvedValue(null);

      await expect(service.verifyResetCode(email, 'wrong')).rejects.toThrow(
        new UnauthorizedException('Código inválido'),
      );
    });

    it('should throw UnauthorizedException when code is expired', async () => {
      const expiredCode = {
        id: 'reset-1',
        email,
        code,
        attempts: 0,
        is_verified: false,
        expires_at: new Date(Date.now() - 1000), // expired
      };
      mockPrisma.password_reset_codes.findFirst.mockResolvedValue(expiredCode);
      mockPrisma.password_reset_codes.delete.mockResolvedValue({});

      await expect(service.verifyResetCode(email, code)).rejects.toThrow(
        new UnauthorizedException('El código ha expirado'),
      );
      expect(mockPrisma.password_reset_codes.delete).toHaveBeenCalledWith({
        where: { id: expiredCode.id },
      });
    });

    it('should throw ForbiddenException when too many attempts', async () => {
      const tooManyAttempts = {
        id: 'reset-1',
        email,
        code,
        attempts: 5,
        is_verified: false,
        expires_at: new Date(Date.now() + 5 * 60 * 1000), // not expired
      };
      mockPrisma.password_reset_codes.findFirst.mockResolvedValue(
        tooManyAttempts,
      );
      mockPrisma.password_reset_codes.delete.mockResolvedValue({});

      await expect(service.verifyResetCode(email, code)).rejects.toThrow(
        new ForbiddenException(
          'Demasiados intentos. Solicita un nuevo código',
        ),
      );
      expect(mockPrisma.password_reset_codes.delete).toHaveBeenCalledWith({
        where: { id: tooManyAttempts.id },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // RESET PASSWORD
  // ═══════════════════════════════════════════════════════════════
  describe('resetPassword', () => {
    const email = 'test@example.com';
    const code = '123456';
    const newPassword = 'NewPassword456!';

    it('should reset the password successfully', async () => {
      const mockResetCode = {
        id: 'reset-1',
        user_id: 'user-1',
        email,
        code,
        is_verified: true,
        expires_at: new Date(Date.now() + 5 * 60 * 1000), // not expired
      };
      mockPrisma.password_reset_codes.findFirst.mockResolvedValue(
        mockResetCode,
      );
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-password');
      mockPrisma.users.findUnique.mockResolvedValue({
        id: 'user-1',
        password_hash: 'old-hashed-password',
      });
      mockPrisma.$transaction.mockResolvedValue([]);

      const result = await service.resetPassword(email, code, newPassword);

      expect(result).toEqual({
        message: 'Contraseña actualizada exitosamente',
      });
      expect(bcrypt.hash).toHaveBeenCalledWith(newPassword, 12);
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.anything(), // password_history.create
          expect.anything(), // users.update
          expect.anything(), // password_reset_codes.deleteMany
          expect.anything(), // user_sessions.deleteMany
        ]),
      );
    });

    it('should throw UnauthorizedException when code is not verified', async () => {
      mockPrisma.password_reset_codes.findFirst.mockResolvedValue(null);

      await expect(
        service.resetPassword(email, code, newPassword),
      ).rejects.toThrow(
        new UnauthorizedException('Código no verificado o inválido'),
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when code has expired', async () => {
      const expiredResetCode = {
        id: 'reset-1',
        user_id: 'user-1',
        email,
        code,
        is_verified: true,
        expires_at: new Date(Date.now() - 1000), // expired
      };
      mockPrisma.password_reset_codes.findFirst.mockResolvedValue(
        expiredResetCode,
      );
      mockPrisma.password_reset_codes.delete.mockResolvedValue({});

      await expect(
        service.resetPassword(email, code, newPassword),
      ).rejects.toThrow(new UnauthorizedException('El código ha expirado'));
      expect(mockPrisma.password_reset_codes.delete).toHaveBeenCalledWith({
        where: { id: expiredResetCode.id },
      });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // GET PROFILE
  // ═══════════════════════════════════════════════════════════════
  describe('getProfile', () => {
    it('should return the profile for a normal user with role-based permissions', async () => {
      const userId = 'user-1';
      const mockUser = {
        id: userId,
        email: 'test@example.com',
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User',
        avatar_url: null,
        is_active: true,
        is_verified: true,
        is_super_admin: false,
        tenant_id: 'tenant-1',
        last_login_at: new Date(),
        tenant: {
          id: 'tenant-1',
          name: 'Test Tenant',
          slug: 'test-tenant',
          logo_url: null,
          plan: 'pro',
        },
        user_roles: [
          {
            role: {
              id: 'role-1',
              name: 'Editor',
              role_permissions: [
                {
                  permission: {
                    module: 'products',
                    submodule: 'catalog',
                    action: 'read',
                  },
                },
                {
                  permission: {
                    module: 'products',
                    submodule: 'catalog',
                    action: 'write',
                  },
                },
              ],
            },
          },
        ],
      };
      mockPrisma.users.findUnique.mockResolvedValue(mockUser);

      const result = await service.getProfile(userId);

      expect(result).toEqual({
        id: userId,
        email: 'test@example.com',
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User',
        avatar_url: null,
        is_super_admin: false,
        tenant: mockUser.tenant,
        roles: [{ id: 'role-1', name: 'Editor' }],
        permissions: ['products.catalog.read', 'products.catalog.write'],
      });
    });

    it('should return all tenant permissions for a super admin', async () => {
      const userId = 'admin-1';
      const mockUser = {
        id: userId,
        email: 'admin@example.com',
        username: 'admin',
        first_name: 'Admin',
        last_name: 'User',
        avatar_url: null,
        is_active: true,
        is_verified: true,
        is_super_admin: true,
        tenant_id: 'tenant-1',
        last_login_at: new Date(),
        tenant: {
          id: 'tenant-1',
          name: 'Test Tenant',
          slug: 'test-tenant',
          logo_url: null,
          plan: 'enterprise',
        },
        user_roles: [],
      };
      const allPermissions = [
        { module: 'products', submodule: 'catalog', action: 'read' },
        { module: 'products', submodule: 'catalog', action: 'write' },
        { module: 'users', submodule: 'management', action: 'delete' },
      ];
      mockPrisma.users.findUnique.mockResolvedValue(mockUser);
      mockPrisma.permissions.findMany.mockResolvedValue(allPermissions);

      const result = await service.getProfile(userId);

      expect(result).toEqual({
        id: userId,
        email: 'admin@example.com',
        username: 'admin',
        first_name: 'Admin',
        last_name: 'User',
        avatar_url: null,
        is_super_admin: true,
        tenant: mockUser.tenant,
        roles: [{ id: 'super_admin', name: 'Super Administrador' }],
        permissions: [
          'products.catalog.read',
          'products.catalog.write',
          'users.management.delete',
        ],
      });
      expect(mockPrisma.permissions.findMany).toHaveBeenCalledWith({
        where: { tenant_id: 'tenant-1' },
        select: { module: true, submodule: true, action: true },
      });
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      mockPrisma.users.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('nonexistent')).rejects.toThrow(
        new UnauthorizedException('Usuario no encontrado'),
      );
    });
  });
});
