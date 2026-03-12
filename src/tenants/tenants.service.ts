import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantOnboardingService } from './tenant-onboarding.service';
import { paginate, PaginatedResult } from '../common/helpers/paginate';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    private prisma: PrismaService,
    private onboarding: TenantOnboardingService,
  ) {}

  async findAll(query: { page?: number; limit?: number; search?: string }): Promise<PaginatedResult<any>> {
    const where: any = {};

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
        { contact_email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return paginate(this.prisma.tenants, {
      where,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        domain: true,
        is_active: true,
        plan: true,
        max_users: true,
        contact_email: true,
        created_at: true,
        _count: { select: { users: true } },
      },
    }, { page: query.page, limit: query.limit });
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenants.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        logo_url: true,
        domain: true,
        is_active: true,
        settings: true,
        max_users: true,
        plan: true,
        contact_email: true,
        contact_phone: true,
        address: true,
        created_at: true,
        updated_at: true,
        _count: { select: { users: true, roles: true, permissions: true } },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant no encontrado');
    }

    return tenant;
  }

  async create(data: {
    name: string;
    admin_email: string;
    domain?: string;
    contact_email?: string;
    contact_phone?: string;
    address?: string;
    plan?: string;
    max_users?: number;
  }) {
    // Generar slug
    const slug = data.name
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const existing = await this.prisma.tenants.findUnique({ where: { slug } });
    if (existing) {
      throw new ConflictException('Ya existe un tenant con un nombre similar');
    }

    const tenant = await this.prisma.tenants.create({
      data: {
        name: data.name,
        slug,
        domain: data.domain,
        contact_email: data.contact_email,
        contact_phone: data.contact_phone,
        address: data.address,
        plan: data.plan || 'basic',
        max_users: data.max_users || 50,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        is_active: true,
        plan: true,
        created_at: true,
      },
    });

    // Ejecutar onboarding (permisos, rol admin, usuario admin)
    const onboardResult = await this.onboarding.onboard(tenant.id, data.admin_email);

    this.logger.log(`Tenant creado: ${tenant.name} (${tenant.slug})`);
    return { ...tenant, ...onboardResult };
  }

  async update(id: string, data: {
    name?: string;
    domain?: string;
    contact_email?: string;
    contact_phone?: string;
    address?: string;
    plan?: string;
    max_users?: number;
  }) {
    const tenant = await this.prisma.tenants.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('Tenant no encontrado');
    }

    return this.prisma.tenants.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        slug: true,
        domain: true,
        is_active: true,
        plan: true,
        max_users: true,
        contact_email: true,
        updated_at: true,
      },
    });
  }

  async toggleStatus(id: string) {
    const tenant = await this.prisma.tenants.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('Tenant no encontrado');
    }

    const updated = await this.prisma.tenants.update({
      where: { id },
      data: { is_active: !tenant.is_active },
      select: { id: true, is_active: true },
    });

    return {
      message: updated.is_active ? 'Tenant activado' : 'Tenant desactivado',
      is_active: updated.is_active,
    };
  }

  async getSettings(id: string) {
    const tenant = await this.prisma.tenants.findUnique({
      where: { id },
      select: { settings: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant no encontrado');
    }

    return tenant.settings || {};
  }

  async updateSettings(id: string, settings: Record<string, any>) {
    const tenant = await this.prisma.tenants.findUnique({
      where: { id },
      select: { settings: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant no encontrado');
    }

    const merged = { ...(tenant.settings as Record<string, any> || {}), ...settings };

    return this.prisma.tenants.update({
      where: { id },
      data: { settings: merged },
      select: { id: true, settings: true, updated_at: true },
    });
  }
}
