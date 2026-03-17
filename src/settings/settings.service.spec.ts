import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SettingsService', () => {
  let service: SettingsService;

  const mockPrisma = {
    settings: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return settings grouped by group name', async () => {
      mockPrisma.settings.findMany.mockResolvedValue([
        { key: 'site_name', value: 'My App', group: 'general', type: 'string' },
        { key: 'max_users', value: '100', group: 'general', type: 'number' },
        { key: 'smtp_host', value: 'smtp.test.com', group: 'email', type: 'string' },
      ]);

      const result = await service.findAll();

      expect(result).toEqual({
        general: { site_name: 'My App', max_users: 100 },
        email: { smtp_host: 'smtp.test.com' },
      });
      expect(mockPrisma.settings.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: [{ group: 'asc' }, { key: 'asc' }],
      });
    });

    it('should filter by group when provided', async () => {
      mockPrisma.settings.findMany.mockResolvedValue([]);

      await service.findAll('email');

      expect(mockPrisma.settings.findMany).toHaveBeenCalledWith({
        where: { group: 'email' },
        orderBy: [{ group: 'asc' }, { key: 'asc' }],
      });
    });
  });

  describe('findByKey', () => {
    it('should return a setting with cast value', async () => {
      mockPrisma.settings.findUnique.mockResolvedValue({
        key: 'max_users',
        value: '50',
        group: 'general',
        type: 'number',
      });

      const result = await service.findByKey('max_users');

      expect(result).toEqual({
        key: 'max_users',
        value: 50,
        group: 'general',
        type: 'number',
      });
    });

    it('should throw NotFoundException when setting does not exist', async () => {
      mockPrisma.settings.findUnique.mockResolvedValue(null);

      await expect(service.findByKey('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('upsert', () => {
    it('should upsert a setting', async () => {
      const upserted = { key: 'site_name', value: 'New Name', group: 'general', type: 'string' };
      mockPrisma.settings.upsert.mockResolvedValue(upserted);

      const result = await service.upsert('site_name', { value: 'New Name', group: 'general', type: 'string' });

      expect(result).toEqual(upserted);
      expect(mockPrisma.settings.upsert).toHaveBeenCalledWith({
        where: { key: 'site_name' },
        update: { value: 'New Name', updated_at: expect.any(Date) },
        create: {
          key: 'site_name',
          value: 'New Name',
          group: 'general',
          type: 'string',
        },
      });
    });

    it('should default group to general and type to string', async () => {
      mockPrisma.settings.upsert.mockResolvedValue({});

      await service.upsert('key1', { value: 'val1' });

      expect(mockPrisma.settings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            group: 'general',
            type: 'string',
          }),
        }),
      );
    });
  });

  describe('upsertBulk', () => {
    it('should upsert multiple settings and return results', async () => {
      const settings = [
        { key: 'k1', value: 'v1' },
        { key: 'k2', value: 'v2' },
      ];
      mockPrisma.settings.upsert
        .mockResolvedValueOnce({ key: 'k1', value: 'v1' })
        .mockResolvedValueOnce({ key: 'k2', value: 'v2' });

      const result = await service.upsertBulk(settings);

      expect(result.message).toBe('2 settings actualizados');
      expect(result.results).toHaveLength(2);
      expect(mockPrisma.settings.upsert).toHaveBeenCalledTimes(2);
    });
  });

  describe('remove', () => {
    it('should delete a setting', async () => {
      mockPrisma.settings.findUnique.mockResolvedValue({ key: 'old_key' });
      mockPrisma.settings.delete.mockResolvedValue({});

      const result = await service.remove('old_key');

      expect(result).toEqual({ message: 'Setting eliminado exitosamente' });
      expect(mockPrisma.settings.delete).toHaveBeenCalledWith({ where: { key: 'old_key' } });
    });

    it('should throw NotFoundException when setting does not exist', async () => {
      mockPrisma.settings.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getValue', () => {
    it('should return the value when setting exists', async () => {
      mockPrisma.settings.findUnique.mockResolvedValue({ key: 'site_name', value: 'My App' });

      const result = await service.getValue('site_name');

      expect(result).toBe('My App');
    });

    it('should return the default value when setting does not exist', async () => {
      mockPrisma.settings.findUnique.mockResolvedValue(null);

      const result = await service.getValue('missing', 'fallback');

      expect(result).toBe('fallback');
    });

    it('should return null when setting does not exist and no default', async () => {
      mockPrisma.settings.findUnique.mockResolvedValue(null);

      const result = await service.getValue('missing');

      expect(result).toBeNull();
    });
  });

  describe('castValue (via findAll and findByKey)', () => {
    it('should cast number type', async () => {
      mockPrisma.settings.findMany.mockResolvedValue([
        { key: 'num', value: '42', group: 'test', type: 'number' },
      ]);

      const result = await service.findAll();

      expect(result['test']['num']).toBe(42);
    });

    it('should cast boolean type', async () => {
      mockPrisma.settings.findMany.mockResolvedValue([
        { key: 'flag_on', value: 'true', group: 'test', type: 'boolean' },
        { key: 'flag_off', value: 'false', group: 'test', type: 'boolean' },
      ]);

      const result = await service.findAll();

      expect(result['test']['flag_on']).toBe(true);
      expect(result['test']['flag_off']).toBe(false);
    });

    it('should cast json type', async () => {
      mockPrisma.settings.findMany.mockResolvedValue([
        { key: 'config', value: '{"a":1,"b":"two"}', group: 'test', type: 'json' },
      ]);

      const result = await service.findAll();

      expect(result['test']['config']).toEqual({ a: 1, b: 'two' });
    });

    it('should return raw string when json parsing fails', async () => {
      mockPrisma.settings.findMany.mockResolvedValue([
        { key: 'bad_json', value: 'not-json{', group: 'test', type: 'json' },
      ]);

      const result = await service.findAll();

      expect(result['test']['bad_json']).toBe('not-json{');
    });

    it('should return string as-is for string type', async () => {
      mockPrisma.settings.findMany.mockResolvedValue([
        { key: 'name', value: 'hello', group: 'test', type: 'string' },
      ]);

      const result = await service.findAll();

      expect(result['test']['name']).toBe('hello');
    });
  });
});
