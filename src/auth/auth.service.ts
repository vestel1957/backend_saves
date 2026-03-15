import { Injectable, UnauthorizedException, ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { EmailService } from '../email/email.service';
import { generateSecret, generateURI, verify as otpVerify } from 'otplib';
import * as QRCode from 'qrcode';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private emailService: EmailService,
  ) {}

  // ─── LOGIN ──────────────────────────────────────────────
  async login(data: {
    email: string;
    password: string;
    ip_address?: string;
    user_agent?: string;
  }) {
    const user = await this.prisma.users.findUnique({
      where: { email: data.email },
      select: {
        id: true,
        email: true,
        password_hash: true,
        is_active: true,
        is_super_admin: true,
        is_2fa_enabled: true,
        totp_secret: true,
        deleted_at: true,
      },
    });

    if (!user || !user.is_active || user.deleted_at) {
      await this.registerLoginAttempt({
        email: data.email,
        ip_address: data.ip_address,
        user_agent: data.user_agent,
        success: false,
        failure_reason: !user ? 'user_not_found' : 'account_disabled',
      });
      throw new UnauthorizedException('Credenciales invalidas');
    }

    // Account lockout: bloquear tras 5 intentos fallidos en los ultimos 15 minutos
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const recentFailures = await this.prisma.login_attempts.count({
      where: {
        email: data.email,
        success: false,
        created_at: { gt: fifteenMinutesAgo },
      },
    });

    if (recentFailures >= 5) {
      await this.registerLoginAttempt({
        email: data.email,
        ip_address: data.ip_address,
        user_agent: data.user_agent,
        success: false,
        failure_reason: 'account_locked',
      });
      throw new ForbiddenException(
        'Cuenta bloqueada temporalmente por multiples intentos fallidos. Intenta de nuevo en 15 minutos',
      );
    }

    const isPasswordValid = await bcrypt.compare(data.password, user.password_hash);

    if (!isPasswordValid) {
      await this.registerLoginAttempt({
        email: data.email,
        ip_address: data.ip_address,
        user_agent: data.user_agent,
        success: false,
        failure_reason: 'invalid_password',
      });
      throw new UnauthorizedException('Credenciales invalidas');
    }

    await this.registerLoginAttempt({
      email: data.email,
      ip_address: data.ip_address,
      user_agent: data.user_agent,
      success: true,
    });

    // Si tiene 2FA activado, devolver token temporal
    if (user.is_2fa_enabled && user.totp_secret) {
      const temp_token = this.jwtService.sign(
        { sub: user.id, requires_2fa: true, ip_address: data.ip_address, user_agent: data.user_agent },
        { expiresIn: '5m' },
      );

      this.logger.log(`Login requiere 2FA: ${data.email}`);
      return {
        requires_2fa: true,
        temp_token,
      };
    }

    const tokens = await this.generateTokens(user.id, user.is_super_admin);

    await this.createSession({
      user_id: user.id,
      refresh_token: tokens.refresh_token,
      ip_address: data.ip_address,
      user_agent: data.user_agent,
    });

    await this.prisma.users.update({
      where: { id: user.id },
      data: { last_login_at: new Date() },
    });

    this.logger.log(`Login exitoso: ${data.email} desde ${data.ip_address}`);
    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    };
  }

  // ─── REFRESH TOKEN ──────────────────────────────────────
  async refreshTokens(refresh_token: string) {
    const token_hash = this.hashToken(refresh_token);

    return this.prisma.$transaction(async (tx) => {
      const session = await tx.user_sessions.findUnique({
        where: { token_hash },
        include: { user: true },
      });

      if (!session || session.expires_at < new Date()) {
        if (session) {
          await tx.user_sessions.delete({ where: { id: session.id } });
        }
        throw new UnauthorizedException('Refresh token invalido o expirado');
      }

      if (!session.user.is_active || session.user.deleted_at) {
        throw new ForbiddenException('Cuenta desactivada');
      }

      await tx.user_sessions.delete({ where: { id: session.id } });

      const tokens = await this.generateTokens(
        session.user.id,
        session.user.is_super_admin,
      );

      const new_token_hash = this.hashToken(tokens.refresh_token);
      await tx.user_sessions.create({
        data: {
          user_id: session.user.id,
          token_hash: new_token_hash,
          ip_address: session.ip_address || null,
          user_agent: session.user_agent || null,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      return {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      };
    });
  }

  // ─── LOGOUT ─────────────────────────────────────────────
  async logout(refresh_token: string, user_id: string) {
    const token_hash = this.hashToken(refresh_token);

    const deleted = await this.prisma.user_sessions.deleteMany({
      where: { token_hash, user_id },
    });

    if (deleted.count === 0) {
      throw new UnauthorizedException('Sesion no encontrada o no pertenece a este usuario');
    }

    return { message: 'Sesion cerrada exitosamente' };
  }

  // ─── LOGOUT ALL ─────────────────────────────────────────
  async logoutAll(user_id: string) {
    await this.prisma.user_sessions.deleteMany({
      where: { user_id },
    });

    return { message: 'Todas las sesiones cerradas exitosamente' };
  }

  // ─── GET SESSIONS ───────────────────────────────────────
  async getSessions(user_id: string) {
    return this.prisma.user_sessions.findMany({
      where: {
        user_id,
        expires_at: { gt: new Date() },
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
  }

  // ─── FORGOT PASSWORD (PASO 1) ──────────────────────────
  async forgotPassword(email: string) {
    const user = await this.prisma.users.findUnique({
      where: { email },
    });

    if (!user || !user.is_active || user.deleted_at) {
      return { message: 'Si el correo existe, recibiras un codigo de verificacion' };
    }

    await this.prisma.password_reset_codes.deleteMany({
      where: { email },
    });

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    await this.prisma.password_reset_codes.create({
      data: {
        user_id: user.id,
        email,
        code,
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    await this.emailService.sendResetCode(email, code, user.first_name ?? undefined);

    return { message: 'Si el correo existe, recibiras un codigo de verificacion' };
  }

  // ─── VERIFY CODE (PASO 2) ──────────────────────────────
  async verifyResetCode(email: string, code: string) {
    const resetCode = await this.prisma.password_reset_codes.findFirst({
      where: { email },
      orderBy: { created_at: 'desc' },
    });

    if (!resetCode) {
      throw new UnauthorizedException('Codigo invalido');
    }

    if (resetCode.expires_at < new Date()) {
      await this.prisma.password_reset_codes.delete({ where: { id: resetCode.id } });
      throw new UnauthorizedException('El codigo ha expirado');
    }

    if (resetCode.attempts >= 5) {
      await this.prisma.password_reset_codes.delete({ where: { id: resetCode.id } });
      throw new ForbiddenException('Demasiados intentos. Solicita un nuevo codigo');
    }

    await this.prisma.password_reset_codes.update({
      where: { id: resetCode.id },
      data: { attempts: { increment: 1 } },
    });

    if (resetCode.code !== code) {
      throw new UnauthorizedException('Codigo invalido');
    }

    await this.prisma.password_reset_codes.update({
      where: { id: resetCode.id },
      data: { is_verified: true },
    });

    return { message: 'Codigo verificado correctamente', verified: true };
  }

  // ─── RESET PASSWORD (PASO 3) ───────────────────────────
  async resetPassword(email: string, code: string, new_password: string) {
    const resetCode = await this.prisma.password_reset_codes.findFirst({
      where: { email, code, is_verified: true },
    });

    if (!resetCode) {
      throw new UnauthorizedException('Codigo no verificado o invalido');
    }

    if (resetCode.expires_at < new Date()) {
      await this.prisma.password_reset_codes.delete({ where: { id: resetCode.id } });
      throw new UnauthorizedException('El codigo ha expirado');
    }

    const passwordHistory = await this.prisma.password_history.findMany({
      where: { user_id: resetCode.user_id },
      orderBy: { changed_at: 'desc' },
      take: 5,
      select: { password_hash: true },
    });

    const currentUser = await this.prisma.users.findUnique({
      where: { id: resetCode.user_id },
      select: { password_hash: true },
    });

    const hashesToCheck = [
      ...(currentUser ? [currentUser.password_hash] : []),
      ...passwordHistory.map((h) => h.password_hash),
    ];

    for (const oldHash of hashesToCheck) {
      if (await bcrypt.compare(new_password, oldHash)) {
        throw new ConflictException(
          'La nueva contrasena no puede ser igual a las ultimas 5 contrasenas utilizadas',
        );
      }
    }

    const password_hash = await bcrypt.hash(new_password, 12);

    await this.prisma.$transaction(async (tx) => {
      if (currentUser) {
        await tx.password_history.create({
          data: {
            user_id: resetCode.user_id,
            password_hash: currentUser.password_hash,
            changed_by: resetCode.user_id,
          },
        });
      }

      await tx.users.update({
        where: { id: resetCode.user_id },
        data: { password_hash },
      });

      await tx.password_reset_codes.deleteMany({
        where: { email },
      });

      await tx.user_sessions.deleteMany({
        where: { user_id: resetCode.user_id },
      });
    });

    this.logger.log(`Contrasena reseteada para: ${email}`);
    return { message: 'Contrasena actualizada exitosamente' };
  }

  // ─── GET PROFILE ────────────────────────────────────────
  async getProfile(user_id: string) {
    const user = await this.prisma.users.findUnique({
      where: { id: user_id },
      select: {
        id: true,
        email: true,
        username: true,
        first_name: true,
        last_name: true,
        avatar_url: true,
        is_active: true,
        is_verified: true,
        is_super_admin: true,
        last_login_at: true,
        user_roles: {
          include: {
            role: {
              include: {
                role_permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    let permissions: string[] = [];
    let roles: { id: string; name: string }[] = [];

    if (user.is_super_admin) {
      const allPermissions = await this.prisma.permissions.findMany({
        select: { module: true, submodule: true, action: true },
      });

      permissions = allPermissions.map(
        (p) => `${p.module}.${p.submodule}.${p.action}`,
      );
      roles = [{ id: 'super_admin', name: 'Super Administrador' }];
    } else {
      permissions = [
        ...new Set(
          user.user_roles.flatMap((ur) =>
            ur.role.role_permissions.map(
              (rp) => `${rp.permission.module}.${rp.permission.submodule}.${rp.permission.action}`,
            ),
          ),
        ),
      ];
      roles = user.user_roles.map((ur) => ({
        id: ur.role.id,
        name: ur.role.name,
      }));
    }

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      avatar_url: user.avatar_url,
      is_super_admin: user.is_super_admin,
      roles,
      permissions,
    };
  }

  // ─── 2FA SETUP ──────────────────────────────────────────
  async setup2fa(user_id: string) {
    const user = await this.prisma.users.findUnique({
      where: { id: user_id },
      select: { email: true, is_2fa_enabled: true, totp_secret: true },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    if (user.is_2fa_enabled) {
      throw new ConflictException('2FA ya esta activado. Desactivalo primero para reconfigurar.');
    }

    const secret = generateSecret();
    const appName = process.env.SMTP_FROM_NAME || 'Dashboard';
    const otpauthUrl = generateURI({ issuer: appName, label: user.email, secret });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    // Guardar secret temporalmente (no activado aun)
    await this.prisma.users.update({
      where: { id: user_id },
      data: { totp_secret: secret },
    });

    return {
      secret,
      qr_code: qrCodeDataUrl,
      message: 'Escanea el QR con Google Authenticator y verifica con el codigo',
    };
  }

  // ─── 2FA VERIFY & ACTIVATE ─────────────────────────────
  async verify2fa(user_id: string, code: string) {
    const user = await this.prisma.users.findUnique({
      where: { id: user_id },
      select: { totp_secret: true, is_2fa_enabled: true },
    });

    if (!user || !user.totp_secret) {
      throw new UnauthorizedException('Primero configura 2FA con /auth/2fa/setup');
    }

    const { valid: isValid } = await otpVerify({ token: code, secret: user.totp_secret });

    if (!isValid) {
      throw new UnauthorizedException('Codigo 2FA invalido');
    }

    await this.prisma.users.update({
      where: { id: user_id },
      data: { is_2fa_enabled: true },
    });

    return { message: '2FA activado exitosamente' };
  }

  // ─── 2FA DISABLE ────────────────────────────────────────
  async disable2fa(user_id: string, code: string) {
    const user = await this.prisma.users.findUnique({
      where: { id: user_id },
      select: { totp_secret: true, is_2fa_enabled: true },
    });

    if (!user || !user.is_2fa_enabled || !user.totp_secret) {
      throw new UnauthorizedException('2FA no esta activado');
    }

    const { valid: isValid } = await otpVerify({ token: code, secret: user.totp_secret });

    if (!isValid) {
      throw new UnauthorizedException('Codigo 2FA invalido');
    }

    await this.prisma.users.update({
      where: { id: user_id },
      data: { is_2fa_enabled: false, totp_secret: null },
    });

    return { message: '2FA desactivado exitosamente' };
  }

  // ─── 2FA LOGIN VERIFY ──────────────────────────────────
  async verifyLogin2fa(temp_token: string, code: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(temp_token);
    } catch {
      throw new UnauthorizedException('Token temporal invalido o expirado');
    }

    if (!payload.requires_2fa) {
      throw new UnauthorizedException('Token no es de tipo 2FA');
    }

    const user = await this.prisma.users.findUnique({
      where: { id: payload.sub },
      select: { id: true, totp_secret: true, is_super_admin: true },
    });

    if (!user || !user.totp_secret) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    const { valid: isValid } = await otpVerify({ token: code, secret: user.totp_secret });

    if (!isValid) {
      throw new UnauthorizedException('Codigo 2FA invalido');
    }

    // Generar tokens reales
    const tokens = await this.generateTokens(user.id, user.is_super_admin);

    await this.createSession({
      user_id: user.id,
      refresh_token: tokens.refresh_token,
      ip_address: payload.ip_address,
      user_agent: payload.user_agent,
    });

    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    };
  }

  // ═══════════════════════════════════════════════════════
  // METODOS PRIVADOS
  // ═══════════════════════════════════════════════════════

  private async generateTokens(user_id: string, is_super_admin: boolean) {
    const payload = {
      sub: user_id,
      is_super_admin,
    };

    const access_token = this.jwtService.sign(payload, {
      expiresIn: '15m',
    });

    const refresh_token = randomBytes(64).toString('hex');

    return { access_token, refresh_token };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async createSession(data: {
    user_id: string;
    refresh_token: string;
    ip_address?: string | null;
    user_agent?: string | null;
  }) {
    const token_hash = this.hashToken(data.refresh_token);

    await this.prisma.user_sessions.create({
      data: {
        user_id: data.user_id,
        token_hash,
        ip_address: data.ip_address || null,
        user_agent: data.user_agent || null,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  }

  private async registerLoginAttempt(data: {
    email: string;
    ip_address?: string | null;
    user_agent?: string | null;
    success: boolean;
    failure_reason?: string;
  }) {
    await this.prisma.login_attempts.create({
      data: {
        email: data.email,
        ip_address: data.ip_address || '0.0.0.0',
        user_agent: data.user_agent || null,
        success: data.success,
        failure_reason: data.failure_reason || null,
      },
    });
  }
}
