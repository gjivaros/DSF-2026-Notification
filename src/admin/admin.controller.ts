import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { CurrentPrincipal, Roles } from '../auth/auth.decorators';
import { UserPrincipal } from '../auth/auth.types';
import { CreateCampaignInput, ListCampaignsQuery } from '../campaigns/campaigns.inputs';
import { CampaignsService } from '../campaigns/campaigns.service';
import { Errors } from '../common/errors';
import { IdempotencyKey } from '../idempotency/idempotency.decorators';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { QuotaService } from '../quota/quota.service';
import { CreateSmsInput, ListSmsQuery } from '../sms/sms.inputs';
import { SmsService } from '../sms/sms.service';
import { AdminStatsQuery, CreateApplicationInput, UpdateApplicationStatusInput } from './admin.inputs';
import { AdminService } from './admin.service';

const appIdPipe = new ParseUUIDPipe({ exceptionFactory: () => Errors.applicationNotFound() });
const smsIdPipe = new ParseUUIDPipe({ exceptionFactory: () => Errors.smsNotFound() });
const campaignIdPipe = new ParseUUIDPipe({ exceptionFactory: () => Errors.campaignNotFound() });

// Routes used by the dashboard. Application-scoped routes act on behalf of the application,
// through the same services, rules and quota as the public API.
@Controller('admin')
@Roles('ROOT', 'APP_ADMIN')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly smsService: SmsService,
    private readonly campaignsService: CampaignsService,
    private readonly quotaService: QuotaService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Roles('ROOT')
  @Get('stats')
  stats(@Query() query: AdminStatsQuery) {
    return this.adminService.stats(query);
  }

  @Get('applications')
  applications(@CurrentPrincipal() principal: UserPrincipal) {
    return this.adminService.applications(principal);
  }

  @Roles('ROOT')
  @Post('applications')
  createApplication(@Body() input: CreateApplicationInput) {
    return this.adminService.createApplication(input);
  }

  @Roles('ROOT')
  @Patch('applications/:appId/status')
  updateStatus(@Param('appId', appIdPipe) appId: string, @Body() input: UpdateApplicationStatusInput) {
    return this.adminService.updateApplicationStatus(appId, input);
  }

  @Roles('ROOT')
  @Get('applications/:appId/status-history')
  statusHistory(@Param('appId', appIdPipe) appId: string) {
    return this.adminService.statusHistory(appId);
  }

  @Get('applications/:appId/usage')
  async usage(@CurrentPrincipal() principal: UserPrincipal, @Param('appId', appIdPipe) appId: string) {
    const app = await this.adminService.actAs(principal, appId);
    return this.quotaService.getDailyUsage(app.applicationId);
  }

  @Get('applications/:appId/sms')
  async listSms(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param('appId', appIdPipe) appId: string,
    @Query() query: ListSmsQuery,
  ) {
    return this.smsService.list(await this.adminService.actAs(principal, appId), query);
  }

  @Get('applications/:appId/sms/:smsId')
  async findSms(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param('appId', appIdPipe) appId: string,
    @Param('smsId', smsIdPipe) smsId: string,
  ) {
    return this.smsService.findOne(await this.adminService.actAs(principal, appId), smsId);
  }

  @Post('applications/:appId/sms')
  async sendSms(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param('appId', appIdPipe) appId: string,
    @IdempotencyKey() key: string,
    @Body() input: CreateSmsInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const app = await this.adminService.actAs(principal, appId, { write: true });
    const result = await this.idempotency.execute(
      appId,
      key,
      this.idempotency.hashRequest('POST', '/sms', input),
      async () => ({ status: HttpStatus.ACCEPTED, body: await this.smsService.create(app, input) }),
    );
    res.status(result.status);
    return result.body;
  }

  @Post('applications/:appId/sms/:smsId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelSms(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param('appId', appIdPipe) appId: string,
    @Param('smsId', smsIdPipe) smsId: string,
  ) {
    return this.smsService.cancel(await this.adminService.actAs(principal, appId), smsId);
  }

  @Post('applications/:appId/sms/:smsId/retry')
  @HttpCode(HttpStatus.OK)
  async retrySms(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param('appId', appIdPipe) appId: string,
    @Param('smsId', smsIdPipe) smsId: string,
  ) {
    return this.smsService.retry(await this.adminService.actAs(principal, appId, { write: true }), smsId);
  }

  @Get('applications/:appId/campaigns')
  async listCampaigns(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param('appId', appIdPipe) appId: string,
    @Query() query: ListCampaignsQuery,
  ) {
    return this.campaignsService.list(await this.adminService.actAs(principal, appId), query);
  }

  @Get('applications/:appId/campaigns/:campaignId')
  async findCampaign(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param('appId', appIdPipe) appId: string,
    @Param('campaignId', campaignIdPipe) campaignId: string,
  ) {
    return this.campaignsService.findOne(await this.adminService.actAs(principal, appId), campaignId);
  }

  @Post('applications/:appId/campaigns')
  async createCampaign(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param('appId', appIdPipe) appId: string,
    @IdempotencyKey() key: string,
    @Body() input: CreateCampaignInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const app = await this.adminService.actAs(principal, appId, { write: true });
    const result = await this.idempotency.execute(
      appId,
      key,
      this.idempotency.hashRequest('POST', '/campaigns', input),
      async () => ({ status: HttpStatus.ACCEPTED, body: await this.campaignsService.create(app, input) }),
    );
    res.status(result.status);
    return result.body;
  }
}
