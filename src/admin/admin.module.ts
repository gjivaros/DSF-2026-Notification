import { Module } from '@nestjs/common';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { QuotaModule } from '../quota/quota.module';
import { SmsModule } from '../sms/sms.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [SmsModule, CampaignsModule, QuotaModule, IdempotencyModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
