import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async findAll(group?: string) {
    const where: any = {};
    if (group) where.group = group;

    const settings = await this.prisma.settings.findMany({
      where,
      orderBy: [{ group: 'asc' }, { key: 'asc' }],
    });

    // Return grouped by group name
    const grouped: Record<string, Record<string, any>> = {};
    for (const s of settings) {
      if (!grouped[s.group]) grouped[s.group] = {};
      grouped[s.group][s.key] = this.castValue(s.value, s.type);
    }
    return grouped;
  }

  async findByKey(key: string) {
    const setting = await this.prisma.settings.findUnique({ where: { key } });
    if (!setting) throw new NotFoundException(`Setting "${key}" no encontrado`);
    return { ...setting, value: this.castValue(setting.value, setting.type) };
  }

  async upsert(key: string, data: { value: string; group?: string; type?: string }) {
    return this.prisma.settings.upsert({
      where: { key },
      update: { value: data.value, updated_at: new Date() },
      create: {
        key,
        value: data.value,
        group: data.group || 'general',
        type: data.type || 'string',
      },
    });
  }

  async upsertBulk(settings: { key: string; value: string; group?: string; type?: string }[]) {
    const results = await Promise.all(
      settings.map((s) => this.upsert(s.key, s)),
    );
    return { message: `${results.length} settings actualizados`, results };
  }

  async remove(key: string) {
    const setting = await this.prisma.settings.findUnique({ where: { key } });
    if (!setting) throw new NotFoundException(`Setting "${key}" no encontrado`);
    await this.prisma.settings.delete({ where: { key } });
    return { message: 'Setting eliminado exitosamente' };
  }

  // Helper to get a single value with default
  async getValue(key: string, defaultValue?: string): Promise<string | null> {
    const setting = await this.prisma.settings.findUnique({ where: { key } });
    return setting?.value ?? defaultValue ?? null;
  }

  private castValue(value: string, type: string): any {
    switch (type) {
      case 'number': return Number(value);
      case 'boolean': return value === 'true';
      case 'json':
        try { return JSON.parse(value); } catch { return value; }
      default: return value;
    }
  }
}
