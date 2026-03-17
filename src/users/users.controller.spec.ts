import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuditService } from '../common/services/audit.service';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';

// Mock UploadsService at module level to avoid uuid ESM import issue
jest.mock('../uploads/uploads.service', () => ({
  UploadsService: jest.fn().mockImplementation(() => ({
    saveFile: jest.fn(),
    saveFiles: jest.fn(),
    deleteFile: jest.fn(),
  })),
}));

import { UploadsService } from '../uploads/uploads.service';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: Record<string, jest.Mock>;
  let uploadsService: Record<string, jest.Mock>;
  let auditService: Record<string, jest.Mock>;

  const mockReq = {
    ip: '127.0.0.1',
    protocol: 'http',
    headers: { 'user-agent': 'test-agent' },
    get: jest.fn().mockReturnValue('localhost:3000'),
  } as any;

  beforeEach(async () => {
    usersService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      changePassword: jest.fn(),
      adminResetPassword: jest.fn(),
      toggleStatus: jest.fn(),
      getUserRoles: jest.fn(),
      assignRoles: jest.fn(),
      removeRole: jest.fn(),
      getUserPermissions: jest.fn(),
      assignExtraPermissions: jest.fn(),
      replaceExtraPermissions: jest.fn(),
      removeExtraPermission: jest.fn(),
      getAreas: jest.fn(),
      getSedes: jest.fn(),
    };

    uploadsService = {
      saveFile: jest.fn(),
      saveFiles: jest.fn(),
      deleteFile: jest.fn(),
    };

    auditService = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: UploadsService, useValue: uploadsService },
        { provide: AuditService, useValue: auditService },
        { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
        { provide: Reflector, useValue: { get: jest.fn() } },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── findAll ────────────────────────────────────────────────

  describe('findAll', () => {
    it('should delegate to usersService.findAll with parsed query', async () => {
      const serviceResult = {
        data: [{ id: 'u1', email: 'a@b.com', avatar_url: null, signature_url: null }],
        meta: { total: 1, page: 1, limit: 10, total_pages: 1 },
      };
      usersService.findAll.mockResolvedValue(serviceResult);

      const result = await controller.findAll(
        { page: '2', limit: '20', search: 'john', is_active: 'true' },
        mockReq,
      );

      expect(usersService.findAll).toHaveBeenCalledWith({
        page: 2,
        limit: 20,
        search: 'john',
        is_active: true,
      });
      expect(result.data).toBeDefined();
    });

    it('should handle missing query params gracefully', async () => {
      usersService.findAll.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 10, total_pages: 0 } });

      await controller.findAll({}, mockReq);

      expect(usersService.findAll).toHaveBeenCalledWith({
        page: undefined,
        limit: undefined,
        search: undefined,
        is_active: undefined,
      });
    });
  });

  // ─── findOne ────────────────────────────────────────────────

  describe('findOne', () => {
    it('should delegate to usersService.findOne', async () => {
      const user = { id: 'u1', email: 'a@b.com', avatar_url: null, signature_url: null };
      usersService.findOne.mockResolvedValue(user);

      const result = await controller.findOne('u1', mockReq);

      expect(usersService.findOne).toHaveBeenCalledWith('u1');
      expect(result.id).toBe('u1');
    });
  });

  // ─── create ─────────────────────────────────────────────────

  describe('create', () => {
    it('should delegate to usersService.create and log audit', async () => {
      const createdUser = { id: 'new-id', email: 'new@b.com', username: 'new', avatar_url: null, signature_url: null };
      usersService.create.mockResolvedValue(createdUser);

      const body = { email: 'new@b.com', first_name: 'New' } as any;
      const result = await controller.create('admin-id', body, mockReq, {} as any);

      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@b.com' }),
        'admin-id',
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          module: 'configuracion',
          submodule: 'usuarios',
          action: 'crear',
          resource_id: 'new-id',
        }),
      );
      expect(result.id).toBe('new-id');
    });

    it('should upload avatar when file provided', async () => {
      const createdUser = { id: 'new-id', email: 'x@b.com', username: 'x', avatar_url: '/uploads/avatars/abc.jpg', signature_url: null };
      usersService.create.mockResolvedValue(createdUser);
      uploadsService.saveFile.mockReturnValue('/uploads/avatars/abc.jpg');

      const files = { avatar: [{ originalname: 'photo.jpg' }] } as any;
      await controller.create('admin-id', { email: 'x@b.com' } as any, mockReq, files);

      expect(uploadsService.saveFile).toHaveBeenCalledWith(files.avatar[0], 'avatars');
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ avatar_url: '/uploads/avatars/abc.jpg' }),
        'admin-id',
      );
    });
  });

  // ─── update ─────────────────────────────────────────────────

  describe('update', () => {
    it('should delegate to usersService.update and log audit', async () => {
      const updatedUser = { id: 'u1', email: 'a@b.com', first_name: 'Updated', avatar_url: null, signature_url: null };
      usersService.update.mockResolvedValue(updatedUser);

      const body = { first_name: 'Updated' } as any;
      const result = await controller.update('u1', 'admin-id', body, mockReq, {} as any);

      expect(usersService.update).toHaveBeenCalledWith('u1', expect.objectContaining({ first_name: 'Updated' }), 'admin-id');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          module: 'configuracion',
          submodule: 'usuarios',
          action: 'editar',
          resource_id: 'u1',
        }),
      );
      expect(result.first_name).toBe('Updated');
    });
  });

  // ─── remove ─────────────────────────────────────────────────

  describe('remove', () => {
    it('should delegate to usersService.remove and log audit', async () => {
      usersService.remove.mockResolvedValue({ message: 'Usuario eliminado exitosamente' });

      const result = await controller.remove('u1', 'admin-id', mockReq);

      expect(usersService.remove).toHaveBeenCalledWith('u1');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'eliminar',
          resource_id: 'u1',
        }),
      );
      expect(result.message).toBe('Usuario eliminado exitosamente');
    });
  });

  // ─── changePassword ─────────────────────────────────────────

  describe('changePassword', () => {
    it('should delegate to usersService.changePassword', async () => {
      usersService.changePassword.mockResolvedValue({ message: 'Contrasena actualizada exitosamente' });

      const result = await controller.changePassword('u1', 'admin-id', { new_password: 'New123!' } as any, mockReq);

      expect(usersService.changePassword).toHaveBeenCalledWith('u1', { new_password: 'New123!' }, 'admin-id');
      expect(result.message).toBe('Contrasena actualizada exitosamente');
    });
  });

  // ─── toggleStatus ───────────────────────────────────────────

  describe('toggleStatus', () => {
    it('should delegate to usersService.toggleStatus and log audit', async () => {
      usersService.toggleStatus.mockResolvedValue({ message: 'Usuario desactivado', is_active: false });

      const result = await controller.toggleStatus('u1', 'admin-id', mockReq);

      expect(usersService.toggleStatus).toHaveBeenCalledWith('u1');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'toggle_status' }),
      );
      expect(result.is_active).toBe(false);
    });
  });

  // ─── getUserRoles ───────────────────────────────────────────

  describe('getUserRoles', () => {
    it('should delegate to usersService.getUserRoles', async () => {
      const roles = [{ id: 'r1', name: 'Admin' }];
      usersService.getUserRoles.mockResolvedValue(roles);

      const result = await controller.getUserRoles('u1');

      expect(usersService.getUserRoles).toHaveBeenCalledWith('u1');
      expect(result).toEqual(roles);
    });
  });

  // ─── assignRoles ────────────────────────────────────────────

  describe('assignRoles', () => {
    it('should delegate to usersService.assignRoles and log audit', async () => {
      usersService.assignRoles.mockResolvedValue({ message: 'Roles asignados exitosamente' });

      const body = { role_ids: ['r1', 'r2'] } as any;
      const result = await controller.assignRoles('u1', 'admin-id', body, mockReq);

      expect(usersService.assignRoles).toHaveBeenCalledWith('u1', body, 'admin-id');
      expect(auditService.log).toHaveBeenCalled();
      expect(result.message).toBe('Roles asignados exitosamente');
    });
  });

  // ─── removeRole ─────────────────────────────────────────────

  describe('removeRole', () => {
    it('should delegate to usersService.removeRole and log audit', async () => {
      usersService.removeRole.mockResolvedValue({ message: 'Rol removido exitosamente' });

      const result = await controller.removeRole('u1', 'r1', 'admin-id', mockReq);

      expect(usersService.removeRole).toHaveBeenCalledWith('u1', 'r1');
      expect(auditService.log).toHaveBeenCalled();
      expect(result.message).toBe('Rol removido exitosamente');
    });
  });

  // ─── getUserPermissions ─────────────────────────────────────

  describe('getUserPermissions', () => {
    it('should delegate to usersService.getUserPermissions', async () => {
      const perms = [{ id: 'p1', full: 'config.users.view', source: 'role' }];
      usersService.getUserPermissions.mockResolvedValue(perms);

      const result = await controller.getUserPermissions('u1');

      expect(usersService.getUserPermissions).toHaveBeenCalledWith('u1');
      expect(result).toEqual(perms);
    });
  });

  // ─── assignExtraPermissions ─────────────────────────────────

  describe('assignExtraPermissions', () => {
    it('should delegate to usersService.assignExtraPermissions and log audit', async () => {
      usersService.assignExtraPermissions.mockResolvedValue({ message: 'Permisos extra asignados exitosamente' });

      const body = { permission_ids: ['p1', 'p2'] } as any;
      const result = await controller.assignExtraPermissions('u1', 'admin-id', body, mockReq);

      expect(usersService.assignExtraPermissions).toHaveBeenCalledWith('u1', body, 'admin-id');
      expect(auditService.log).toHaveBeenCalled();
      expect(result.message).toBe('Permisos extra asignados exitosamente');
    });
  });

  // ─── replaceExtraPermissions ────────────────────────────────

  describe('replaceExtraPermissions', () => {
    it('should delegate to usersService.replaceExtraPermissions and log audit', async () => {
      usersService.replaceExtraPermissions.mockResolvedValue({ message: 'Permisos extra actualizados exitosamente' });

      const body = { permission_ids: ['p3'] } as any;
      const result = await controller.replaceExtraPermissions('u1', 'admin-id', body, mockReq);

      expect(usersService.replaceExtraPermissions).toHaveBeenCalledWith('u1', body, 'admin-id');
      expect(auditService.log).toHaveBeenCalled();
      expect(result.message).toBe('Permisos extra actualizados exitosamente');
    });
  });

  // ─── removeExtraPermission ──────────────────────────────────

  describe('removeExtraPermission', () => {
    it('should delegate to usersService.removeExtraPermission and log audit', async () => {
      usersService.removeExtraPermission.mockResolvedValue({ message: 'Permiso extra removido exitosamente' });

      const result = await controller.removeExtraPermission('u1', 'p1', 'admin-id', mockReq);

      expect(usersService.removeExtraPermission).toHaveBeenCalledWith('u1', 'p1');
      expect(auditService.log).toHaveBeenCalled();
      expect(result.message).toBe('Permiso extra removido exitosamente');
    });
  });

  // ─── getAreas ───────────────────────────────────────────────

  describe('getAreas', () => {
    it('should delegate to usersService.getAreas', async () => {
      const areas = [{ id: 'a1', name: 'Engineering' }];
      usersService.getAreas.mockResolvedValue(areas);

      const result = await controller.getAreas();

      expect(usersService.getAreas).toHaveBeenCalled();
      expect(result).toEqual(areas);
    });
  });

  // ─── getSedes ───────────────────────────────────────────────

  describe('getSedes', () => {
    it('should delegate to usersService.getSedes', async () => {
      const sedes = [{ id: 's1', name: 'Bogota' }];
      usersService.getSedes.mockResolvedValue(sedes);

      const result = await controller.getSedes();

      expect(usersService.getSedes).toHaveBeenCalled();
      expect(result).toEqual(sedes);
    });
  });
});
