import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UploadsService } from '../uploads/uploads.service';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn(), changePassword: jest.fn(), toggleStatus: jest.fn(), getUserRoles: jest.fn(), assignRoles: jest.fn(), removeRole: jest.fn(), getUserPermissions: jest.fn(), assignExtraPermissions: jest.fn(), replaceExtraPermissions: jest.fn(), removeExtraPermission: jest.fn(), getAreas: jest.fn(), getSedes: jest.fn() } },
        { provide: UploadsService, useValue: { saveFile: jest.fn(), saveFiles: jest.fn(), deleteFile: jest.fn() } },
        { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
        { provide: Reflector, useValue: { get: jest.fn() } },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
