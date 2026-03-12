import { Injectable, UnauthorizedException, ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { EmailService } from '../email/email.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private emailService: EmailService,
  ) {}

  // ─── REGISTRO ───────────────────────────────────────────
  // Crea un nuevo usuario con su contraseña hasheada
  async register(data: {
    email: string;
    username: string;
    password: string;
    first_name?: string;
    last_name?: string;
    tenant_id: string;
  }) {
    // Verificar si el email o username ya existen
    const existingUser = await this.prisma.users.findFirst({
      where: {
        OR: [
          { email: data.email },
          { username: data.username },
        ],
      },
    });

    if (existingUser) {
      throw new ConflictException(
        existingUser.email === data.email
          ? 'El email ya está registrado'
          : 'El username ya está en uso',
      );
    }

    // Verificar que el tenant existe y está activo
    const tenant = await this.prisma.tenants.findUnique({
      where: { id: data.tenant_id },
    });

    if (!tenant || !tenant.is_active) {
      throw new ForbiddenException('Tenant no encontrado o inactivo');
    }

    // Hashear la contraseña con bcrypt (12 rondas de salt)
    const password_hash = await bcrypt.hash(data.password, 12);

    // Crear el usuario en la BD
    const user = await this.prisma.users.create({
      data: {
        email: data.email,
        username: data.username,
        password_hash,
        first_name: data.first_name,
        last_name: data.last_name,
        tenant_id: data.tenant_id,
      },
      // Solo retornamos estos campos, nunca el password_hash
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

    this.logger.log(`Usuario registrado: ${user.email} (tenant: ${data.tenant_id})`);
    return { message: 'Usuario registrado exitosamente', user };
  }

  // ─── LOGIN ──────────────────────────────────────────────
  // Valida credenciales y genera access + refresh token
  async login(data: {
    email: string;
    password: string;
    ip_address?: string;
    user_agent?: string;
  }) {
    // Buscar usuario por email
    const user = await this.prisma.users.findUnique({
      where: { email: data.email },
      include: {
        tenant: true, // Incluimos info del tenant
      },
    });

    // Si no existe o está inactivo, registrar intento fallido
    if (!user || !user.is_active) {
      await this.registerLoginAttempt({
        email: data.email,
        tenant_id: user?.tenant_id,
        ip_address: data.ip_address,
        user_agent: data.user_agent,
        success: false,
        failure_reason: !user ? 'user_not_found' : 'account_disabled',
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Verificar que el tenant esté activo
    if (!user.tenant || !user.tenant.is_active) {
      await this.registerLoginAttempt({
        email: data.email,
        tenant_id: user.tenant_id,
        ip_address: data.ip_address,
        user_agent: data.user_agent,
        success: false,
        failure_reason: 'tenant_disabled',
      });
      throw new ForbiddenException('La organización se encuentra inactiva');
    }

    // Account lockout: bloquear tras 5 intentos fallidos en los últimos 15 minutos
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
        tenant_id: user.tenant_id,
        ip_address: data.ip_address,
        user_agent: data.user_agent,
        success: false,
        failure_reason: 'account_locked',
      });
      throw new ForbiddenException(
        'Cuenta bloqueada temporalmente por múltiples intentos fallidos. Intenta de nuevo en 15 minutos',
      );
    }

    // Verificar la contraseña contra el hash
    const isPasswordValid = await bcrypt.compare(data.password, user.password_hash);

    if (!isPasswordValid) {
      await this.registerLoginAttempt({
        email: data.email,
        tenant_id: user.tenant_id,
        ip_address: data.ip_address,
        user_agent: data.user_agent,
        success: false,
        failure_reason: 'invalid_password',
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Registrar intento exitoso
    await this.registerLoginAttempt({
      email: data.email,
      tenant_id: user.tenant_id,
      ip_address: data.ip_address,
      user_agent: data.user_agent,
      success: true,
    });

    // Generar tokens
    const tokens = await this.generateTokens(user.id, user.tenant_id, user.is_super_admin);

    // Guardar el refresh token hasheado en user_sessions
    await this.createSession({
      user_id: user.id,
      tenant_id: user.tenant_id,
      refresh_token: tokens.refresh_token,
      ip_address: data.ip_address,
      user_agent: data.user_agent,
    });

    // Actualizar último login
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
  // Genera nuevos tokens a partir de un refresh token válido
  async refreshTokens(refresh_token: string) {
    // Hashear el refresh token para buscarlo en la BD
    const token_hash = this.hashToken(refresh_token);

    // Usar transacción interactiva para evitar race conditions
    // Si dos requests llegan con el mismo token, solo uno pasará
    return this.prisma.$transaction(async (tx) => {
      // Buscar la sesión con ese token
      const session = await tx.user_sessions.findUnique({
        where: { token_hash },
        include: { user: true },
      });

      // Si no existe o ya expiró, denegar
      if (!session || session.expires_at < new Date()) {
        if (session) {
          await tx.user_sessions.delete({ where: { id: session.id } });
        }
        throw new UnauthorizedException('Refresh token inválido o expirado');
      }

      // Verificar que el usuario siga activo
      if (!session.user.is_active) {
        throw new ForbiddenException('Cuenta desactivada');
      }

      // Eliminar la sesión vieja (rotación de tokens)
      await tx.user_sessions.delete({ where: { id: session.id } });

      // Generar nuevos tokens
      const tokens = await this.generateTokens(
        session.user.id,
        session.user.tenant_id,
        session.user.is_super_admin,
      );

      // Crear nueva sesión con el nuevo refresh token
      const new_token_hash = this.hashToken(tokens.refresh_token);
      await tx.user_sessions.create({
        data: {
          user_id: session.user.id,
          tenant_id: session.user.tenant_id,
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
  // Elimina la sesión actual del usuario (verificando ownership)
  async logout(refresh_token: string, user_id: string) {
    const token_hash = this.hashToken(refresh_token);

    // Solo eliminar si la sesión pertenece al usuario autenticado
    const deleted = await this.prisma.user_sessions.deleteMany({
      where: { token_hash, user_id },
    });

    if (deleted.count === 0) {
      throw new UnauthorizedException('Sesión no encontrada o no pertenece a este usuario');
    }

    return { message: 'Sesión cerrada exitosamente' };
  }

  // ─── LOGOUT ALL ─────────────────────────────────────────
  // Elimina TODAS las sesiones del usuario (cierra todo)
  async logoutAll(user_id: string) {
    await this.prisma.user_sessions.deleteMany({
      where: { user_id },
    });

    return { message: 'Todas las sesiones cerradas exitosamente' };
  }

  // ─── GET SESSIONS ───────────────────────────────────────
  // Lista todas las sesiones activas del usuario
  async getSessions(user_id: string) {
    const sessions = await this.prisma.user_sessions.findMany({
      where: {
        user_id,
        expires_at: { gt: new Date() }, // Solo las que no han expirado
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

    return sessions;
  }

  // ─── FORGOT PASSWORD (PASO 1) ──────────────────────────
  // Valida el email, genera código de 6 dígitos y lo envía
  async forgotPassword(email: string) {
    const user = await this.prisma.users.findUnique({
      where: { email },
    });

    // Siempre respondemos igual para no revelar si el email existe
    if (!user || !user.is_active) {
      return { message: 'Si el correo existe, recibirás un código de verificación' };
    }

    // Invalidar códigos anteriores del mismo email
    await this.prisma.password_reset_codes.deleteMany({
      where: { email },
    });

    // Generar código de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Guardar en BD con expiración de 5 minutos
    await this.prisma.password_reset_codes.create({
      data: {
        user_id: user.id,
        email,
        code,
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    // Enviar el código por email
    await this.emailService.sendResetCode(email, code, user.first_name ?? undefined);

    return { message: 'Si el correo existe, recibirás un código de verificación' };
  }

  // ─── VERIFY CODE (PASO 2) ──────────────────────────────
  // Valida que el código sea correcto y no haya expirado
  async verifyResetCode(email: string, code: string) {
    // Buscar por email (NO por code) para poder contar intentos reales
    const resetCode = await this.prisma.password_reset_codes.findFirst({
      where: { email },
      orderBy: { created_at: 'desc' },
    });

    if (!resetCode) {
      throw new UnauthorizedException('Código inválido');
    }

    // Verificar si expiró
    if (resetCode.expires_at < new Date()) {
      await this.prisma.password_reset_codes.delete({ where: { id: resetCode.id } });
      throw new UnauthorizedException('El código ha expirado');
    }

    // Verificar intentos (máximo 5)
    if (resetCode.attempts >= 5) {
      await this.prisma.password_reset_codes.delete({ where: { id: resetCode.id } });
      throw new ForbiddenException('Demasiados intentos. Solicita un nuevo código');
    }

    // Incrementar intentos SIEMPRE antes de comparar el código
    await this.prisma.password_reset_codes.update({
      where: { id: resetCode.id },
      data: { attempts: { increment: 1 } },
    });

    // Ahora sí comparar el código
    if (resetCode.code !== code) {
      throw new UnauthorizedException('Código inválido');
    }

    // Marcar como verificado
    await this.prisma.password_reset_codes.update({
      where: { id: resetCode.id },
      data: { is_verified: true },
    });

    return { message: 'Código verificado correctamente', verified: true };
  }

  // ─── RESET PASSWORD (PASO 3) ───────────────────────────
  // Cambia la contraseña después de verificar el código
  async resetPassword(email: string, code: string, new_password: string) {
    // Buscar código verificado
    const resetCode = await this.prisma.password_reset_codes.findFirst({
      where: { email, code, is_verified: true },
    });

    if (!resetCode) {
      throw new UnauthorizedException('Código no verificado o inválido');
    }

    // Verificar que no haya expirado
    if (resetCode.expires_at < new Date()) {
      await this.prisma.password_reset_codes.delete({ where: { id: resetCode.id } });
      throw new UnauthorizedException('El código ha expirado');
    }

    // Validar que la nueva contraseña no sea igual a las últimas 5
    const passwordHistory = await this.prisma.password_history.findMany({
      where: { user_id: resetCode.user_id },
      orderBy: { changed_at: 'desc' },
      take: 5,
      select: { password_hash: true },
    });

    // También verificar contra la contraseña actual
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
          'La nueva contraseña no puede ser igual a las últimas 5 contraseñas utilizadas',
        );
      }
    }

    // Hashear nueva contraseña
    const password_hash = await bcrypt.hash(new_password, 12);

    // Transacción para actualizar contraseña, historial y cerrar sesiones
    await this.prisma.$transaction(async (tx) => {
      // Guardar contraseña actual en historial
      if (currentUser) {
        await tx.password_history.create({
          data: {
            user_id: resetCode.user_id,
            password_hash: currentUser.password_hash,
            changed_by: resetCode.user_id,
          },
        });
      }

      // Actualizar la contraseña
      await tx.users.update({
        where: { id: resetCode.user_id },
        data: { password_hash },
      });

      // Eliminar todos los códigos del email
      await tx.password_reset_codes.deleteMany({
        where: { email },
      });

      // Cerrar todas las sesiones del usuario
      await tx.user_sessions.deleteMany({
        where: { user_id: resetCode.user_id },
      });
    });

    this.logger.log(`Contraseña reseteada para: ${email}`);
    return { message: 'Contraseña actualizada exitosamente' };
  }


  // ─── GET PROFILE ────────────────────────────────────────
  // Retorna el perfil del usuario autenticado con sus permisos
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
        tenant_id: true,
        last_login_at: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            logo_url: true,
            plan: true,
          },
        },
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

    if (user.is_super_admin && user.tenant_id) {
      // Super admin: traer TODOS los permisos del tenant
      const allPermissions = await this.prisma.permissions.findMany({
        where: { tenant_id: user.tenant_id },
        select: { module: true, submodule: true, action: true },
      });

      permissions = allPermissions.map(
        (p) => `${p.module}.${p.submodule}.${p.action}`,
      );
      roles = [{ id: 'super_admin', name: 'Super Administrador' }];
    } else {
      // Usuario normal: permisos por roles
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
      tenant: user.tenant,
      roles,
      permissions,
    };
  }

  // ═══════════════════════════════════════════════════════
  // MÉTODOS PRIVADOS (helpers internos)
  // ═══════════════════════════════════════════════════════

  // Genera access token (corta vida) + refresh token (larga vida)
  private async generateTokens(user_id: string, tenant_id: string | null, is_super_admin: boolean) {
    // El payload que va dentro del JWT
    const payload = {
      sub: user_id,        // sub = subject (estándar JWT)
      tenant_id,
      is_super_admin,
    };

    // Access token: dura 15 minutos
    const access_token = this.jwtService.sign(payload, {
      expiresIn: '15m',
    });

    // Refresh token: string aleatorio de 64 bytes (no es JWT)
    const refresh_token = randomBytes(64).toString('hex');

    return { access_token, refresh_token };
  }

  // Hashea el refresh token con SHA-256 para guardarlo en la BD
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  // Guarda una sesión en la BD con el refresh token hasheado
  private async createSession(data: {
    user_id: string;
    tenant_id: string | null;
    refresh_token: string;
    ip_address?: string | null;
    user_agent?: string | null;
  }) {
    const token_hash = this.hashToken(data.refresh_token);

    await this.prisma.user_sessions.create({
      data: {
        user_id: data.user_id,
        tenant_id: data.tenant_id,
        token_hash,
        ip_address: data.ip_address || null,
        user_agent: data.user_agent || null,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 días
      },
    });
  }

  // Registra un intento de login (exitoso o fallido)
  private async registerLoginAttempt(data: {
    email: string;
    tenant_id?: string | null;
    ip_address?: string | null;
    user_agent?: string | null;
    success: boolean;
    failure_reason?: string;
  }) {
    await this.prisma.login_attempts.create({
      data: {
        email: data.email,
        tenant_id: data.tenant_id || null,
        ip_address: data.ip_address || '0.0.0.0',
        user_agent: data.user_agent || null,
        success: data.success,
        failure_reason: data.failure_reason || null,
      },
    });
  }
}