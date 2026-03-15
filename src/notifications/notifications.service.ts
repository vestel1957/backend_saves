import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Subject } from 'rxjs';

export interface NotificationEvent {
  user_id: string;
  data: any;
}

@Injectable()
export class NotificationsService {
  private readonly events$ = new Subject<NotificationEvent>();

  constructor(private prisma: PrismaService) {}

  // Observable for SSE connections
  getEventStream() {
    return this.events$.asObservable();
  }

  async create(data: {
    user_id: string;
    title: string;
    message: string;
    type?: string;
    link?: string;
  }) {
    const notification = await this.prisma.notifications.create({
      data: {
        user_id: data.user_id,
        title: data.title,
        message: data.message,
        type: data.type || 'info',
        link: data.link,
      },
    });

    // Emit to SSE listeners
    this.events$.next({
      user_id: data.user_id,
      data: notification,
    });

    return notification;
  }

  async findAll(user_id: string, query: { page?: number; limit?: number; unread_only?: boolean }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = { user_id };
    if (query.unread_only) where.read_at = null;

    const [notifications, total, unread_count] = await Promise.all([
      this.prisma.notifications.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.notifications.count({ where }),
      this.prisma.notifications.count({ where: { user_id, read_at: null } }),
    ]);

    return {
      data: notifications,
      unread_count,
      meta: { total, page, limit, total_pages: Math.ceil(total / limit) },
    };
  }

  async markAsRead(id: string, user_id: string) {
    const notification = await this.prisma.notifications.findFirst({
      where: { id, user_id },
    });

    if (!notification) {
      throw new NotFoundException('Notificacion no encontrada');
    }

    return this.prisma.notifications.update({
      where: { id },
      data: { read_at: new Date() },
    });
  }

  async markAllAsRead(user_id: string) {
    const result = await this.prisma.notifications.updateMany({
      where: { user_id, read_at: null },
      data: { read_at: new Date() },
    });

    return { message: `${result.count} notificaciones marcadas como leidas` };
  }

  async remove(id: string, user_id: string) {
    const notification = await this.prisma.notifications.findFirst({
      where: { id, user_id },
    });

    if (!notification) {
      throw new NotFoundException('Notificacion no encontrada');
    }

    await this.prisma.notifications.delete({ where: { id } });
    return { message: 'Notificacion eliminada' };
  }
}
