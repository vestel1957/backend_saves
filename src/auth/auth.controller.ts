import { Controller, Post, Get, Body, Req, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtGuard } from './guards/jwt.guard';
import { CurrentUser } from './decorators/user-current.decorator';
import { LoginDto, RefreshTokenDto, ForgotPasswordDto, VerifyCodeDto, ResetPasswordDto } from './dto';
import type { Request } from 'express';

@ApiTags('Auth')
@Controller('api/v1/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // ── PUBLICOS ────────────────────────────────────────

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Iniciar sesion' })
  @ApiResponse({ status: 200, description: 'Login exitoso, retorna tokens' })
  @ApiResponse({ status: 401, description: 'Credenciales invalidas' })
  login(@Body() body: LoginDto, @Req() req: Request) {
    return this.authService.login({
      ...body,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
    });
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @ApiOperation({ summary: 'Refrescar tokens' })
  @ApiResponse({ status: 200, description: 'Nuevos tokens generados' })
  @ApiResponse({ status: 401, description: 'Refresh token invalido o expirado' })
  refreshTokens(@Body() body: RefreshTokenDto) {
    return this.authService.refreshTokens(body.refresh_token);
  }

  // ── PROTEGIDOS (necesitan token) ────────────────────

  @UseGuards(JwtGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Cerrar sesion actual' })
  @ApiResponse({ status: 200, description: 'Sesion cerrada' })
  logout(@Body() body: RefreshTokenDto, @CurrentUser('id') userId: string) {
    return this.authService.logout(body.refresh_token, userId);
  }

  @UseGuards(JwtGuard)
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Cerrar todas las sesiones' })
  @ApiResponse({ status: 200, description: 'Todas las sesiones cerradas' })
  logoutAll(@CurrentUser('id') userId: string) {
    return this.authService.logoutAll(userId);
  }

  @UseGuards(JwtGuard)
  @Get('sessions')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Listar sesiones activas' })
  @ApiResponse({ status: 200, description: 'Lista de sesiones' })
  getSessions(@CurrentUser('id') userId: string) {
    return this.authService.getSessions(userId);
  }

  @UseGuards(JwtGuard)
  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Obtener perfil del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Perfil con roles y permisos' })
  getProfile(@CurrentUser('id') userId: string, @Req() req: Request) {
    return this.authService.getProfile(userId)
      .then((profile) => ({
        ...profile,
        avatar_url: this.toAbsoluteUrl(profile.avatar_url, req),
      }));
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @ApiOperation({ summary: 'Solicitar codigo de recuperacion de contrasena' })
  @ApiResponse({ status: 200, description: 'Codigo enviado si el email existe' })
  forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body.email);
  }

  @Post('verify-code')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Verificar codigo de recuperacion' })
  @ApiResponse({ status: 200, description: 'Codigo verificado' })
  @ApiResponse({ status: 401, description: 'Codigo invalido o expirado' })
  verifyResetCode(@Body() body: VerifyCodeDto) {
    return this.authService.verifyResetCode(body.email, body.code);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @ApiOperation({ summary: 'Restablecer contrasena con codigo verificado' })
  @ApiResponse({ status: 200, description: 'Contrasena actualizada' })
  @ApiResponse({ status: 401, description: 'Codigo no verificado o expirado' })
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body.email, body.code, body.new_password);
  }

  private toAbsoluteUrl(filePath?: string | null, req?: Request): string | null | undefined {
    if (!filePath) return filePath;
    if (/^https?:\/\//i.test(filePath)) return filePath;

    const configuredBaseUrl = process.env.PUBLIC_BASE_URL?.trim();
    const baseUrl = configuredBaseUrl
      ? configuredBaseUrl.replace(/\/+$/, '')
      : this.getRequestBaseUrl(req);

    const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
    return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
  }

  private getRequestBaseUrl(req?: Request): string | undefined {
    if (!req) return undefined;

    const forwardedProto = req.headers['x-forwarded-proto'];
    const forwardedHost = req.headers['x-forwarded-host'];
    const protocol = typeof forwardedProto === 'string' ? forwardedProto : req.protocol;
    const host = typeof forwardedHost === 'string' ? forwardedHost : req.get('host');

    if (!host) return undefined;
    return `${protocol}://${host}`.replace(/\/+$/, '');
  }
}
