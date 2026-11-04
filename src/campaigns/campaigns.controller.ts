import { Body, Controller, Get, HttpStatus, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { CurrentPrincipal, Roles } from '../auth/auth.decorators';
import { AppPrincipal } from '../auth/auth.types';
import { Errors } from '../common/errors';
import { IdempotencyKey } from '../idempotency/idempotency.decorators';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { CreateCampaignInput, ListCampaignsQuery } from './campaigns.inputs';
import { CampaignsService } from './campaigns.service';

@Controller('campaigns')
@Roles('APP')
export class CampaignsController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post()
  async create(
    @CurrentPrincipal() principal: AppPrincipal,
    @IdempotencyKey() key: string,
    @Body() input: CreateCampaignInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.idempotency.execute(
      principal.applicationId,
      key,
      this.idempotency.hashRequest('POST', '/campaigns', input),
      async () => ({ status: HttpStatus.ACCEPTED, body: await this.campaignsService.create(principal, input) }),
    );
    res.status(result.status);
    return result.body;
  }

  @Get()
  list(@CurrentPrincipal() principal: AppPrincipal, @Query() query: ListCampaignsQuery) {
    return this.campaignsService.list(principal, query);
  }

  @Get(':id')
  findOne(
    @CurrentPrincipal() principal: AppPrincipal,
    @Param('id', new ParseUUIDPipe({ exceptionFactory: () => Errors.campaignNotFound() })) id: string,
  ) {
    return this.campaignsService.findOne(principal, id);
  }
}
