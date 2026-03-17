import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { NotificationsGateway } from './notifications.gateway';

describe('NotificationsGateway', () => {
  let gateway: NotificationsGateway;
  let jwtService: JwtService;

  const mockJwtService = {
    verify: jest.fn(),
  };

  const createMockSocket = (overrides: any = {}) => ({
    handshake: {
      auth: { token: undefined },
      headers: { authorization: undefined },
      ...overrides.handshake,
    },
    data: {},
    disconnect: jest.fn(),
    join: jest.fn(),
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsGateway,
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    gateway = module.get<NotificationsGateway>(NotificationsGateway);
    jwtService = module.get<JwtService>(JwtService);

    // Mock the server property
    gateway.server = {
      to: jest.fn().mockReturnValue({
        emit: jest.fn(),
      }),
    } as any;

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('should authenticate client with token from auth object', async () => {
      const client = createMockSocket({
        handshake: {
          auth: { token: 'valid-token' },
          headers: {},
        },
      });
      mockJwtService.verify.mockReturnValue({ sub: 'user-123' });

      await gateway.handleConnection(client as any);

      expect(mockJwtService.verify).toHaveBeenCalledWith('valid-token');
      expect(client.data.userId).toBe('user-123');
      expect(client.join).toHaveBeenCalledWith('user:user-123');
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('should authenticate client with token from authorization header', async () => {
      const client = createMockSocket({
        handshake: {
          auth: {},
          headers: { authorization: 'Bearer header-token' },
        },
      });
      mockJwtService.verify.mockReturnValue({ sub: 'user-456' });

      await gateway.handleConnection(client as any);

      expect(mockJwtService.verify).toHaveBeenCalledWith('header-token');
      expect(client.data.userId).toBe('user-456');
      expect(client.join).toHaveBeenCalledWith('user:user-456');
    });

    it('should disconnect client when no token is provided', async () => {
      const client = createMockSocket({
        handshake: {
          auth: {},
          headers: {},
        },
      });

      await gateway.handleConnection(client as any);

      expect(client.disconnect).toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
    });

    it('should disconnect client when token verification fails', async () => {
      const client = createMockSocket({
        handshake: {
          auth: { token: 'invalid-token' },
          headers: {},
        },
      });
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await gateway.handleConnection(client as any);

      expect(client.disconnect).toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('should handle disconnection for authenticated client', () => {
      const client = createMockSocket();
      client.data = { userId: 'user-123' };

      // Should not throw
      expect(() => gateway.handleDisconnect(client as any)).not.toThrow();
    });

    it('should handle disconnection for unauthenticated client', () => {
      const client = createMockSocket();
      client.data = {};

      expect(() => gateway.handleDisconnect(client as any)).not.toThrow();
    });
  });

  describe('sendToUser', () => {
    it('should emit an event to the user room', () => {
      const mockEmit = jest.fn();
      gateway.server = {
        to: jest.fn().mockReturnValue({ emit: mockEmit }),
      } as any;

      const payload = { id: 'n1', title: 'Test' };
      gateway.sendToUser('user-123', 'notification', payload);

      expect(gateway.server.to).toHaveBeenCalledWith('user:user-123');
      expect(mockEmit).toHaveBeenCalledWith('notification', payload);
    });
  });
});
