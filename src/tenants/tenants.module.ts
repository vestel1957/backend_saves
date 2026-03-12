import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { TenantOnboardingService } from './tenant-onboarding.service';

@Module({
  controllers: [TenantsController],
  providers: [TenantsService, TenantOnboardingService],
  exports: [TenantsService, TenantOnboardingService],
})
export class TenantsModule {}
