jest.mock('otplib', () => ({
  generateSecret: jest.fn(() => 'MOCKSECRET'),
  generateURI: jest.fn(() => 'otpauth://totp/test'),
  verify: jest.fn(() => ({ valid: true })),
}));
jest.mock('qrcode', () => ({
  toDataURL: jest.fn(() => 'data:image/png;base64,mock'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<Partial<AuthService>>;

  const mockReq = {
    ip: '127.0.0.1',
    headers: { 'user-agent': 'jest-test' },
    protocol: 'http',
    get: jest.fn(() => 'localhost:3000'),
  } as any;

  beforeEach(async () => {
    authService = {
      login: jest.fn(),
      refreshTokens: jest.fn(),
      logout: jest.fn(),
      logoutAll: jest.fn(),
      getSessions: jest.fn(),
      getProfile: jest.fn(),
      setup2fa: jest.fn(),
      verify2fa: jest.fn(),
      disable2fa: jest.fn(),
      verifyLogin2fa: jest.fn(),
      forgotPassword: jest.fn(),
      verifyResetCode: jest.fn(),
      resetPassword: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: JwtService, useValue: { verify: jest.fn(), sign: jest.fn() } },
        { provide: Reflector, useValue: { get: jest.fn() } },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════
  // LOGIN
  // ═══════════════════════════════════════════════════════════════
  describe('login', () => {
    it('should call authService.login with body and request metadata', async () => {
      const body = { email: 'test@example.com', password: 'Pass123!' };
      const expected = { access_token: 'at', refresh_token: 'rt' };
      authService.login!.mockResolvedValue(expected);

      const result = await controller.login(body, mockReq);

      expect(authService.login).toHaveBeenCalledWith({
        email: body.email,
        password: body.password,
        ip_address: '127.0.0.1',
        user_agent: 'jest-test',
      });
      expect(result).toEqual(expected);
    });

    it('should pass 2FA response through when requires_2fa', async () => {
      const body = { email: 'test@example.com', password: 'Pass123!' };
      const expected = { requires_2fa: true, temp_token: 'tmp-token' };
      authService.login!.mockResolvedValue(expected);

      const result = await controller.login(body, mockReq);

      expect(result).toEqual(expected);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // REFRESH TOKENS
  // ═══════════════════════════════════════════════════════════════
  describe('refreshTokens', () => {
    it('should call authService.refreshTokens with refresh_token', async () => {
      const body = { refresh_token: 'rt-value' };
      const expected = { access_token: 'new-at', refresh_token: 'new-rt' };
      authService.refreshTokens!.mockResolvedValue(expected);

      const result = await controller.refreshTokens(body);

      expect(authService.refreshTokens).toHaveBeenCalledWith('rt-value');
      expect(result).toEqual(expected);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // LOGOUT
  // ═══════════════════════════════════════════════════════════════
  describe('logout', () => {
    it('should call authService.logout with refresh_token and userId', async () => {
      const body = { refresh_token: 'rt-value' };
      const expected = { message: 'Sesion cerrada exitosamente' };
      authService.logout!.mockResolvedValue(expected);

      const result = await controller.logout(body, 'user-uuid-1');

      expect(authService.logout).toHaveBeenCalledWith('rt-value', 'user-uuid-1');
      expect(result).toEqual(expected);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // LOGOUT ALL
  // ═══════════════════════════════════════════════════════════════
  describe('logoutAll', () => {
    it('should call authService.logoutAll with userId', async () => {
      const expected = { message: 'Todas las sesiones cerradas exitosamente' };
      authService.logoutAll!.mockResolvedValue(expected);

      const result = await controller.logoutAll('user-uuid-1');

      expect(authService.logoutAll).toHaveBeenCalledWith('user-uuid-1');
      expect(result).toEqual(expected);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // GET SESSIONS
  // ═══════════════════════════════════════════════════════════════
  describe('getSessions', () => {
    it('should call authService.getSessions with userId', async () => {
      const sessions = [
        { id: 's1', ip_address: '127.0.0.1', user_agent: 'Chrome', created_at: new Date(), expires_at: new Date() },
      ];
      authService.getSessions!.mockResolvedValue(sessions as any);

      const result = await controller.getSessions('user-uuid-1');

      expect(authService.getSessions).toHaveBeenCalledWith('user-uuid-1');
      expect(result).toEqual(sessions);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // GET PROFILE
  // ═══════════════════════════════════════════════════════════════
  describe('getProfile', () => {
    it('should call authService.getProfile and convert relative avatar_url to absolute', async () => {
      const profile = {
        id: 'user-uuid-1',
        email: 'test@test.com',
        username: 'test',
        first_name: 'Test',
        last_name: 'User',
        avatar_url: '/uploads/avatar.png',
        is_super_admin: false,
        roles: [],
        permissions: [],
      };
      authService.getProfile!.mockResolvedValue(profile);

      const result = await controller.getProfile('user-uuid-1', mockReq);

      expect(authService.getProfile).toHaveBeenCalledWith('user-uuid-1');
      expect(result.avatar_url).toContain('/uploads/avatar.png');
      expect(result.avatar_url).toMatch(/^https?:\/\//);
    });

    it('should leave avatar_url as null when profile has no avatar', async () => {
      const profile = {
        id: 'user-uuid-1',
        email: 'test@test.com',
        username: 'test',
        first_name: 'Test',
        last_name: 'User',
        avatar_url: null,
        is_super_admin: false,
        roles: [],
        permissions: [],
      };
      authService.getProfile!.mockResolvedValue(profile);

      const result = await controller.getProfile('user-uuid-1', mockReq);

      expect(result.avatar_url).toBeNull();
    });

    it('should not modify avatar_url when it is already an absolute URL', async () => {
      const profile = {
        id: 'user-uuid-1',
        email: 'test@test.com',
        username: 'test',
        first_name: 'Test',
        last_name: 'User',
        avatar_url: 'https://cdn.example.com/avatar.png',
        is_super_admin: false,
        roles: [],
        permissions: [],
      };
      authService.getProfile!.mockResolvedValue(profile);

      const result = await controller.getProfile('user-uuid-1', mockReq);

      expect(result.avatar_url).toBe('https://cdn.example.com/avatar.png');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 2FA SETUP
  // ═══════════════════════════════════════════════════════════════
  describe('setup2fa', () => {
    it('should call authService.setup2fa with userId', async () => {
      const expected = { secret: 'S', qr_code: 'data:image/png;base64,...', message: 'Escanea el QR' };
      authService.setup2fa!.mockResolvedValue(expected);

      const result = await controller.setup2fa('user-uuid-1');

      expect(authService.setup2fa).toHaveBeenCalledWith('user-uuid-1');
      expect(result).toEqual(expected);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 2FA VERIFY
  // ═══════════════════════════════════════════════════════════════
  describe('verify2fa', () => {
    it('should call authService.verify2fa with userId and code', async () => {
      const expected = { message: '2FA activado exitosamente' };
      authService.verify2fa!.mockResolvedValue(expected);

      const result = await controller.verify2fa('user-uuid-1', { code: '123456' });

      expect(authService.verify2fa).toHaveBeenCalledWith('user-uuid-1', '123456');
      expect(result).toEqual(expected);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 2FA DISABLE
  // ═══════════════════════════════════════════════════════════════
  describe('disable2fa', () => {
    it('should call authService.disable2fa with userId and code', async () => {
      const expected = { message: '2FA desactivado exitosamente' };
      authService.disable2fa!.mockResolvedValue(expected);

      const result = await controller.disable2fa('user-uuid-1', { code: '654321' });

      expect(authService.disable2fa).toHaveBeenCalledWith('user-uuid-1', '654321');
      expect(result).toEqual(expected);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 2FA LOGIN
  // ═══════════════════════════════════════════════════════════════
  describe('login2fa', () => {
    it('should call authService.verifyLogin2fa with temp_token and code', async () => {
      const expected = { access_token: 'at', refresh_token: 'rt' };
      authService.verifyLogin2fa!.mockResolvedValue(expected);

      const result = await controller.login2fa({ temp_token: 'tmp', code: '123456' });

      expect(authService.verifyLogin2fa).toHaveBeenCalledWith('tmp', '123456');
      expect(result).toEqual(expected);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // FORGOT PASSWORD
  // ═══════════════════════════════════════════════════════════════
  describe('forgotPassword', () => {
    it('should call authService.forgotPassword with email', async () => {
      const expected = { message: 'Si el correo existe, recibiras un codigo de verificacion' };
      authService.forgotPassword!.mockResolvedValue(expected);

      const result = await controller.forgotPassword({ email: 'test@test.com' });

      expect(authService.forgotPassword).toHaveBeenCalledWith('test@test.com');
      expect(result).toEqual(expected);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // VERIFY RESET CODE
  // ═══════════════════════════════════════════════════════════════
  describe('verifyResetCode', () => {
    it('should call authService.verifyResetCode with email and code', async () => {
      const expected = { message: 'Codigo verificado correctamente', verified: true };
      authService.verifyResetCode!.mockResolvedValue(expected);

      const result = await controller.verifyResetCode({ email: 'test@test.com', code: '123456' });

      expect(authService.verifyResetCode).toHaveBeenCalledWith('test@test.com', '123456');
      expect(result).toEqual(expected);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // RESET PASSWORD
  // ═══════════════════════════════════════════════════════════════
  describe('resetPassword', () => {
    it('should call authService.resetPassword with email, code, and new_password', async () => {
      const expected = { message: 'Contrasena actualizada exitosamente' };
      authService.resetPassword!.mockResolvedValue(expected);

      const result = await controller.resetPassword({
        email: 'test@test.com',
        code: '123456',
        new_password: 'NewPass789!',
      });

      expect(authService.resetPassword).toHaveBeenCalledWith(
        'test@test.com',
        '123456',
        'NewPass789!',
      );
      expect(result).toEqual(expected);
    });
  });
});
