import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.get<{
      module: string;
      submodule: string;
      action: string;
    }>('permission', context.getHandler());

    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('No autenticado');
    }

    if (user.is_super_admin) {
      return true;
    }

    // 1. Verificar permisos a traves de roles del usuario
    const rolePermission = await this.prisma.role_permissions.findFirst({
      where: {
        permission: {
          module: requiredPermission.module,
          submodule: requiredPermission.submodule,
          action: requiredPermission.action,
        },
        role: {
          user_roles: {
            some: {
              user_id: user.id,
              OR: [
                { expires_at: null },
                { expires_at: { gt: new Date() } },
              ],
            },
          },
          is_active: true,
        },
      },
    });

    if (rolePermission) {
      return true;
    }

    // 2. Verificar permisos directos del usuario
    const directPermission = await this.prisma.user_permissions.findFirst({
      where: {
        user_id: user.id,
        permission: {
          module: requiredPermission.module,
          submodule: requiredPermission.submodule,
          action: requiredPermission.action,
        },
      },
    });

    if (directPermission) {
      return true;
    }

    throw new ForbiddenException(
      `No tienes permiso: ${requiredPermission.module}.${requiredPermission.submodule}.${requiredPermission.action}`,
    );
  }
}
