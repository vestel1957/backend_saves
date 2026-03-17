import { Test, TestingModule } from '@nestjs/testing';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { AuditService } from '../common/services/audit.service';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';

describe('RolesController', () => {
  let controller: RolesController;
  let rolesService: Record<string, jest.Mock>;
  let auditService: Record<string, jest.Mock>;

  const mockReq = {
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test-agent' },
  } as any;

  beforeEach(async () => {
    rolesService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      getRolePermissions: jest.fn(),
      assignPermissions: jest.fn(),
      removePermission: jest.fn(),
      getRoleUsers: jest.fn(),
    };

    auditService = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RolesController],
      providers: [
        { provide: RolesService, useValue: rolesService },
        { provide: AuditService, useValue: auditService },
        { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
        { provide: Reflector, useValue: { get: jest.fn() } },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get<RolesController>(RolesController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── findAll ────────────────────────────────────────────────

  describe('findAll', () => {
    it('should delegate to rolesService.findAll with parsed is_active', async () => {
      const roles = [{ id: 'r1', name: 'Admin', total_users: 5, total_permissions: 10 }];
      rolesService.findAll.mockResolvedValue(roles);

      const result = await controller.findAll({ is_active: 'true' });

      expect(rolesService.findAll).toHaveBeenCalledWith({ is_active: true });
      expect(result).toEqual(roles);
    });

    it('should pass undefined when is_active not provided', async () => {
      rolesService.findAll.mockResolvedValue([]);

      await controller.findAll({});

      expect(rolesService.findAll).toHaveBeenCalledWith({ is_active: undefined });
    });
  });

  // ─── findOne ────────────────────────────────────────────────

  describe('findOne', () => {
    it('should delegate to rolesService.findOne', async () => {
      const role = { id: 'r1', name: 'Admin', permissions: [] };
      rolesService.findOne.mockResolvedValue(role);

      const result = await controller.findOne('r1');

      expect(rolesService.findOne).toHaveBeenCalledWith('r1');
      expect(result).toEqual(role);
    });
  });

  // ─── create ─────────────────────────────────────────────────

  describe('create', () => {
    it('should delegate to rolesService.create and log audit', async () => {
      const created = { id: 'r-new', name: 'New Role', is_active: true };
      rolesService.create.mockResolvedValue(created);

      const body = { name: 'New Role', description: 'desc' } as any;
      const result = await controller.create('admin-id', body, mockReq);

      expect(rolesService.create).toHaveBeenCalledWith(body);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          module: 'configuracion',
          submodule: 'roles',
          action: 'crear',
          resource_id: 'r-new',
        }),
      );
      expect(result).toEqual(created);
    });
  });

  // ─── update ─────────────────────────────────────────────────

  describe('update', () => {
    it('should delegate to rolesService.update and log audit', async () => {
      const updated = { id: 'r1', name: 'Updated', is_active: true };
      rolesService.update.mockResolvedValue(updated);

      const body = { name: 'Updated' } as any;
      const result = await controller.update('r1', 'admin-id', body, mockReq);

      expect(rolesService.update).toHaveBeenCalledWith('r1', body);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'editar',
          resource_id: 'r1',
        }),
      );
      expect(result).toEqual(updated);
    });
  });

  // ─── remove ─────────────────────────────────────────────────

  describe('remove', () => {
    it('should delegate to rolesService.remove and log audit', async () => {
      rolesService.remove.mockResolvedValue({ message: 'Rol eliminado exitosamente' });

      const result = await controller.remove('r1', 'admin-id', mockReq);

      expect(rolesService.remove).toHaveBeenCalledWith('r1');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'eliminar',
          resource_id: 'r1',
        }),
      );
      expect(result.message).toBe('Rol eliminado exitosamente');
    });
  });

  // ─── getRolePermissions ─────────────────────────────────────

  describe('getRolePermissions', () => {
    it('should delegate to rolesService.getRolePermissions', async () => {
      const perms = [{ id: 'p1', full: 'users.management.read' }];
      rolesService.getRolePermissions.mockResolvedValue(perms);

      const result = await controller.getRolePermissions('r1');

      expect(rolesService.getRolePermissions).toHaveBeenCalledWith('r1');
      expect(result).toEqual(perms);
    });
  });

  // ─── assignPermissions ──────────────────────────────────────

  describe('assignPermissions', () => {
    it('should delegate to rolesService.assignPermissions and log audit', async () => {
      rolesService.assignPermissions.mockResolvedValue({ message: 'Permisos asignados exitosamente' });

      const body = { permission_ids: ['p1', 'p2'] } as any;
      const result = await controller.assignPermissions('r1', 'admin-id', body, mockReq);

      expect(rolesService.assignPermissions).toHaveBeenCalledWith('r1', body);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'asignar_permisos',
          resource_id: 'r1',
        }),
      );
      expect(result.message).toBe('Permisos asignados exitosamente');
    });
  });

  // ─── removePermission ──────────────────────────────────────

  describe('removePermission', () => {
    it('should delegate to rolesService.removePermission and log audit', async () => {
      rolesService.removePermission.mockResolvedValue({ message: 'Permiso removido exitosamente' });

      const result = await controller.removePermission('r1', 'p1', 'admin-id', mockReq);

      expect(rolesService.removePermission).toHaveBeenCalledWith('r1', 'p1');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'remover_permiso',
          resource_id: 'r1',
        }),
      );
      expect(result.message).toBe('Permiso removido exitosamente');
    });
  });

  // ─── getRoleUsers ──────────────────────────────────────────

  describe('getRoleUsers', () => {
    it('should delegate to rolesService.getRoleUsers', async () => {
      const users = [{ id: 'u1', email: 'a@b.com', assigned_at: new Date() }];
      rolesService.getRoleUsers.mockResolvedValue(users);

      const result = await controller.getRoleUsers('r1');

      expect(rolesService.getRoleUsers).toHaveBeenCalledWith('r1');
      expect(result).toEqual(users);
    });
  });
});
