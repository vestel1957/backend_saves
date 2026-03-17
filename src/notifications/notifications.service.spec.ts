import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: PrismaService;
  let gateway: NotificationsGateway;

  const mockPrisma = {
    notifications: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockGateway = {
    sendToUser: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsGateway, useValue: mockGateway },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    prisma = module.get<PrismaService>(PrismaService);
    gateway = module.get<NotificationsGateway>(NotificationsGateway);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createData = {
      user_id: 'user-1',
      title: 'Test Notification',
      message: 'This is a test',
      type: 'info',
      link: '/test',
    };

    const createdNotification = {
      id: 'notif-1',
      ...createData,
      read_at: null,
      created_at: new Date(),
    };

    it('should create a notification and send it via gateway', async () => {
      mockPrisma.notifications.create.mockResolvedValue(createdNotification);

      const result = await service.create(createData);

      expect(result).toEqual(createdNotification);
      expect(mockPrisma.notifications.create).toHaveBeenCalledWith({
        data: {
          user_id: 'user-1',
          title: 'Test Notification',
          message: 'This is a test',
          type: 'info',
          link: '/test',
        },
      });
      expect(mockGateway.sendToUser).toHaveBeenCalledWith(
        'user-1',
        'notification',
        createdNotification,
      );
    });

    it('should default type to info when not provided', async () => {
      const dataWithoutType = { user_id: 'user-1', title: 'Test', message: 'msg' };
      mockPrisma.notifications.create.mockResolvedValue(createdNotification);

      await service.create(dataWithoutType);

      expect(mockPrisma.notifications.create).toHaveBeenCalledWith({
        data: {
          user_id: 'user-1',
          title: 'Test',
          message: 'msg',
          type: 'info',
          link: undefined,
        },
      });
    });
  });

  describe('findAll', () => {
    const mockNotifications = [
      { id: 'n1', title: 'Notif 1', read_at: null },
      { id: 'n2', title: 'Notif 2', read_at: new Date() },
    ];

    it('should return paginated notifications with unread count', async () => {
      mockPrisma.notifications.findMany.mockResolvedValue(mockNotifications);
      mockPrisma.notifications.count
        .mockResolvedValueOnce(2) // total
        .mockResolvedValueOnce(1); // unread_count

      const result = await service.findAll('user-1', { page: 1, limit: 10 });

      expect(result).toEqual({
        data: mockNotifications,
        unread_count: 1,
        meta: { total: 2, page: 1, limit: 10, total_pages: 1 },
      });
      expect(mockPrisma.notifications.findMany).toHaveBeenCalledWith({
        where: { user_id: 'user-1' },
        skip: 0,
        take: 10,
        orderBy: { created_at: 'desc' },
      });
    });

    it('should filter unread only when unread_only is true', async () => {
      mockPrisma.notifications.findMany.mockResolvedValue([]);
      mockPrisma.notifications.count.mockResolvedValue(0);

      await service.findAll('user-1', { unread_only: true });

      expect(mockPrisma.notifications.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: 'user-1', read_at: null },
        }),
      );
    });

    it('should clamp limit to max 50', async () => {
      mockPrisma.notifications.findMany.mockResolvedValue([]);
      mockPrisma.notifications.count.mockResolvedValue(0);

      const result = await service.findAll('user-1', { limit: 100 });

      expect(result.meta.limit).toBe(50);
    });

    it('should default page to 1 and limit to 20', async () => {
      mockPrisma.notifications.findMany.mockResolvedValue([]);
      mockPrisma.notifications.count.mockResolvedValue(0);

      const result = await service.findAll('user-1', {});

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
    });
  });

  describe('markAsRead', () => {
    it('should mark a notification as read', async () => {
      const notification = { id: 'n1', user_id: 'user-1', read_at: null };
      const updated = { ...notification, read_at: new Date() };

      mockPrisma.notifications.findFirst.mockResolvedValue(notification);
      mockPrisma.notifications.update.mockResolvedValue(updated);

      const result = await service.markAsRead('n1', 'user-1');

      expect(result).toEqual(updated);
      expect(mockPrisma.notifications.findFirst).toHaveBeenCalledWith({
        where: { id: 'n1', user_id: 'user-1' },
      });
      expect(mockPrisma.notifications.update).toHaveBeenCalledWith({
        where: { id: 'n1' },
        data: { read_at: expect.any(Date) },
      });
    });

    it('should throw NotFoundException when notification does not exist', async () => {
      mockPrisma.notifications.findFirst.mockResolvedValue(null);

      await expect(service.markAsRead('n999', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all unread notifications as read', async () => {
      mockPrisma.notifications.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.markAllAsRead('user-1');

      expect(result).toEqual({ message: '5 notifications marked as read' });
      expect(mockPrisma.notifications.updateMany).toHaveBeenCalledWith({
        where: { user_id: 'user-1', read_at: null },
        data: { read_at: expect.any(Date) },
      });
    });

    it('should return 0 count when no unread notifications', async () => {
      mockPrisma.notifications.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.markAllAsRead('user-1');

      expect(result).toEqual({ message: '0 notifications marked as read' });
    });
  });

  describe('remove', () => {
    it('should delete a notification', async () => {
      const notification = { id: 'n1', user_id: 'user-1' };
      mockPrisma.notifications.findFirst.mockResolvedValue(notification);
      mockPrisma.notifications.delete.mockResolvedValue(notification);

      const result = await service.remove('n1', 'user-1');

      expect(result).toEqual({ message: 'Notification deleted' });
      expect(mockPrisma.notifications.delete).toHaveBeenCalledWith({
        where: { id: 'n1' },
      });
    });

    it('should throw NotFoundException when notification does not exist', async () => {
      mockPrisma.notifications.findFirst.mockResolvedValue(null);

      await expect(service.remove('n999', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
