import { Test, TestingModule } from '@nestjs/testing';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';

describe('RolesController', () => {
  let controller: RolesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RolesController],
      providers: [
        { provide: RolesService, useValue: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn(), getRolePermissions: jest.fn(), assignPermissions: jest.fn(), removePermission: jest.fn(), getRoleUsers: jest.fn() } },
        { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
        { provide: Reflector, useValue: { get: jest.fn() } },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get<RolesController>(RolesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
