import { Global, Module } from '@nestjs/common';
import { AuditService } from './services/audit.service';
import { AuditLogController } from './audit/audit-log.controller';
import { HealthController } from './health/health.controller';

@Global()
@Module({
  controllers: [AuditLogController, HealthController],
  providers: [AuditService],
  exports: [AuditService],
})
export class CommonModule {}
