import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { AuditService } from '../common/services/audit.service';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';

describe('PermissionsController', () => {
  let controller: PermissionsController;
  let permissionsService: Record<string, jest.Mock>;
  let auditService: Record<string, jest.Mock>;

  const mockReq = {
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test-agent' },
  } as any;

  beforeEach(async () => {
    permissionsService = {
      findAll: jest.fn(),
      findAllGrouped: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      createBulk: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    auditService = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PermissionsController],
      providers: [
        { provide: PermissionsService, useValue: permissionsService },
        { provide: AuditService, useValue: auditService },
        { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
        { provide: Reflector, useValue: { get: jest.fn() } },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get<PermissionsController>(PermissionsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── findAll ────────────────────────────────────────────────

  describe('findAll', () => {
    it('should delegate to permissionsService.findAll with query', async () => {
      const perms = [{ id: 'p1', module: 'users', submodule: 'management', action: 'read' }];
      permissionsService.findAll.mockResolvedValue(perms);

      const result = await controller.findAll({ module: 'users', submodule: 'management' });

      expect(permissionsService.findAll).toHaveBeenCalledWith({ module: 'users', submodule: 'management' });
      expect(result).toEqual(perms);
    });

    it('should pass empty query when no filters', async () => {
      permissionsService.findAll.mockResolvedValue([]);

      await controller.findAll({});

      expect(permissionsService.findAll).toHaveBeenCalledWith({});
    });
  });

  // ─── findAllGrouped ─────────────────────────────────────────

  describe('findAllGrouped', () => {
    it('should delegate to permissionsService.findAllGrouped', async () => {
      const grouped = { users: { management: [{ id: 'p1', action: 'read' }] } };
      permissionsService.findAllGrouped.mockResolvedValue(grouped);

      const result = await controller.findAllGrouped();

      expect(permissionsService.findAllGrouped).toHaveBeenCalled();
      expect(result).toEqual(grouped);
    });
  });

  // ─── findOne ────────────────────────────────────────────────

  describe('findOne', () => {
    it('should delegate to permissionsService.findOne', async () => {
      const perm = { id: 'p1', module: 'users', submodule: 'management', action: 'read' };
      permissionsService.findOne.mockResolvedValue(perm);

      const result = await controller.findOne('p1');

      expect(permissionsService.findOne).toHaveBeenCalledWith('p1');
      expect(result).toEqual(perm);
    });
  });

  // ─── create ─────────────────────────────────────────────────

  describe('create', () => {
    it('should delegate to permissionsService.create and log audit', async () => {
      const created = { id: 'p-new', module: 'users', submodule: 'management', action: 'delete' };
      permissionsService.create.mockResolvedValue(created);

      const body = { module: 'users', submodule: 'management', action: 'delete' } as any;
      const result = await controller.create('admin-id', body, mockReq);

      expect(permissionsService.create).toHaveBeenCalledWith(body);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          module: 'configuracion',
          submodule: 'permisos',
          action: 'crear',
          resource_id: 'p-new',
        }),
      );
      expect(result).toEqual(created);
    });
  });

  // ─── createBulk ─────────────────────────────────────────────

  describe('createBulk', () => {
    it('should delegate to permissionsService.createBulk and log audit', async () => {
      const bulkResult = {
        message: '2 permisos creados',
        results: [
          { module: 'a', submodule: 'b', action: 'c', status: 'created', id: 'p1' },
          { module: 'd', submodule: 'e', action: 'f', status: 'created', id: 'p2' },
        ],
      };
      permissionsService.createBulk.mockResolvedValue(bulkResult);

      const body = {
        permissions: [
          { module: 'a', submodule: 'b', action: 'c' },
          { module: 'd', submodule: 'e', action: 'f' },
        ],
      } as any;
      const result = await controller.createBulk('admin-id', body, mockReq);

      expect(permissionsService.createBulk).toHaveBeenCalledWith(body);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'crear_masivo',
          new_data: { count: 2 },
        }),
      );
      expect(result).toEqual(bulkResult);
    });
  });

  // ─── update ─────────────────────────────────────────────────

  describe('update', () => {
    it('should delegate to permissionsService.update and log audit', async () => {
      const updated = { id: 'p1', module: 'users', submodule: 'management', action: 'read', description: 'Updated' };
      permissionsService.update.mockResolvedValue(updated);

      const body = { description: 'Updated' } as any;
      const result = await controller.update('p1', 'admin-id', body, mockReq);

      expect(permissionsService.update).toHaveBeenCalledWith('p1', body);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'editar',
          resource_id: 'p1',
        }),
      );
      expect(result).toEqual(updated);
    });
  });

  // ─── remove ─────────────────────────────────────────────────

  describe('remove', () => {
    it('should delegate to permissionsService.remove and log audit', async () => {
      permissionsService.remove.mockResolvedValue({ message: 'Permiso eliminado exitosamente' });

      const result = await controller.remove('p1', 'admin-id', mockReq);

      expect(permissionsService.remove).toHaveBeenCalledWith('p1');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'eliminar',
          resource_id: 'p1',
        }),
      );
      expect(result.message).toBe('Permiso eliminado exitosamente');
    });
  });
});
