import { Global, Module } from '@nestjs/common';
import { AuditService } from './services/audit.service';
import { AuditLogController } from './audit/audit-log.controller';
import { HealthController } from './health/health.controller';
import { AuthModule } from '../auth/auth.module';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [AuditLogController, HealthController],
  providers: [AuditService],
  exports: [AuditService],
})
export class CommonModule {}
