import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { register: jest.fn(), login: jest.fn(), refreshTokens: jest.fn(), logout: jest.fn(), logoutAll: jest.fn(), getSessions: jest.fn(), getProfile: jest.fn(), forgotPassword: jest.fn(), verifyResetCode: jest.fn(), resetPassword: jest.fn() } },
        { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
        { provide: Reflector, useValue: { get: jest.fn() } },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
