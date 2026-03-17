import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from './email.service';

// Mock nodemailer - use inline jest.fn() to avoid hoisting issues
jest.mock('nodemailer', () => {
  const mockSendMail = jest.fn();
  const mockVerify = jest.fn();
  return {
    createTransport: jest.fn().mockReturnValue({
      sendMail: mockSendMail,
      verify: mockVerify,
    }),
    __mockSendMail: mockSendMail,
    __mockVerify: mockVerify,
  };
});

// Access the mocks after module initialization
const nodemailer = require('nodemailer');
const mockSendMail = nodemailer.__mockSendMail;
const mockVerify = nodemailer.__mockVerify;

describe('EmailService', () => {
  let service: EmailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailService],
    }).compile();

    service = module.get<EmailService>(EmailService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should verify the SMTP transporter on init', async () => {
      mockVerify.mockResolvedValue(true);

      await service.onModuleInit();

      expect(mockVerify).toHaveBeenCalled();
    });

    it('should not throw when SMTP verification fails', async () => {
      mockVerify.mockRejectedValue(new Error('SMTP connection refused'));

      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });
  });

  describe('sendResetCode', () => {
    it('should send a reset code email with name', async () => {
      const mockInfo = { messageId: 'msg-1', response: '250 OK' };
      mockSendMail.mockResolvedValue(mockInfo);

      const result = await service.sendResetCode('user@test.com', '123456', 'John');

      expect(result).toEqual(mockInfo);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@test.com',
          subject: expect.stringContaining('digo de recuperaci'),
          html: expect.stringContaining('123456'),
        }),
      );
    });

    it('should send reset code email without name', async () => {
      mockSendMail.mockResolvedValue({ messageId: 'msg-2', response: '250 OK' });

      await service.sendResetCode('user@test.com', '654321');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@test.com',
          html: expect.stringContaining('654321'),
        }),
      );
    });

    it('should throw when sendMail fails', async () => {
      mockSendMail.mockRejectedValue(new Error('SMTP failure'));

      await expect(
        service.sendResetCode('user@test.com', '123456'),
      ).rejects.toThrow('SMTP failure');
    });
  });

  describe('sendAdminPasswordReset', () => {
    it('should send admin password reset notification with name', async () => {
      const mockInfo = { messageId: 'msg-3' };
      mockSendMail.mockResolvedValue(mockInfo);

      const result = await service.sendAdminPasswordReset('user@test.com', 'Jane');

      expect(result).toEqual(mockInfo);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@test.com',
          subject: expect.stringContaining('restablecida por un administrador'),
          html: expect.stringContaining('administrador'),
        }),
      );
    });

    it('should send admin password reset without name', async () => {
      mockSendMail.mockResolvedValue({ messageId: 'msg-4' });

      await service.sendAdminPasswordReset('user@test.com');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@test.com',
        }),
      );
    });

    it('should throw when sendMail fails', async () => {
      mockSendMail.mockRejectedValue(new Error('Connection refused'));

      await expect(
        service.sendAdminPasswordReset('user@test.com'),
      ).rejects.toThrow('Connection refused');
    });
  });

  describe('sendWelcomeCredentials', () => {
    it('should send welcome email with credentials and name', async () => {
      const mockInfo = { messageId: 'msg-5' };
      mockSendMail.mockResolvedValue(mockInfo);

      const result = await service.sendWelcomeCredentials(
        'new@test.com',
        'TempPass123!',
        'Alice',
      );

      expect(result).toEqual(mockInfo);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'new@test.com',
          subject: expect.stringContaining('Bienvenido'),
          html: expect.stringContaining('TempPass123!'),
        }),
      );
    });

    it('should include the email address in the email body', async () => {
      mockSendMail.mockResolvedValue({ messageId: 'msg-6' });

      await service.sendWelcomeCredentials('new@test.com', 'Pass123');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('new@test.com'),
        }),
      );
    });

    it('should include the password in the email body', async () => {
      mockSendMail.mockResolvedValue({ messageId: 'msg-7' });

      await service.sendWelcomeCredentials('new@test.com', 'SecretPass99');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('SecretPass99'),
        }),
      );
    });

    it('should throw when sendMail fails', async () => {
      mockSendMail.mockRejectedValue(new Error('Timeout'));

      await expect(
        service.sendWelcomeCredentials('new@test.com', 'Pass123'),
      ).rejects.toThrow('Timeout');
    });
  });
});
