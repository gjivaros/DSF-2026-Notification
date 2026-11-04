import { Controller, Get } from '@nestjs/common';
import { CurrentPrincipal, Roles } from '../auth/auth.decorators';
import { AppPrincipal } from '../auth/auth.types';
import { QuotaService } from './quota.service';

@Controller('usage')
@Roles('APP')
export class QuotaController {
  constructor(private readonly quotaService: QuotaService) {}

  @Get('daily')
  daily(@CurrentPrincipal() principal: AppPrincipal) {
    return this.quotaService.getDailyUsage(principal.applicationId);
  }
}
