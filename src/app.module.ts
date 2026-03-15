import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';
import { EmailModule } from './email/email.module';
import { UploadsModule } from './uploads/uploads.module';
import { CommonModule } from './common/common.module';
import { SessionCleanupTask } from './common/tasks/session-cleanup.task';

@Module({
  imports: [
    // Servir archivos estaticos (uploads)
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    // Rate limiting global: 60 requests por minuto por IP
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 60,
    }]),
    // Tareas programadas (cron jobs)
    ScheduleModule.forRoot(),
    CommonModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    EmailModule,
    UploadsModule,
  ],
  controllers: [AppController],
  providers: [AppService, SessionCleanupTask],
})
export class AppModule {}
