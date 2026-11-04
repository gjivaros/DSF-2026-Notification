import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { CurrentPrincipal, Roles } from '../auth/auth.decorators';
import { AppPrincipal } from '../auth/auth.types';
import { Errors } from '../common/errors';
import { IdempotencyKey } from '../idempotency/idempotency.decorators';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { CreateSmsInput, ListSmsQuery } from './sms.inputs';
import { SmsService } from './sms.service';

const smsIdPipe = new ParseUUIDPipe({ exceptionFactory: () => Errors.smsNotFound() });

@Controller('sms')
@Roles('APP')
export class SmsController {
  constructor(
    private readonly smsService: SmsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post()
  async create(
    @CurrentPrincipal() principal: AppPrincipal,
    @IdempotencyKey() key: string,
    @Body() input: CreateSmsInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.idempotency.execute(
      principal.applicationId,
      key,
      this.idempotency.hashRequest('POST', '/sms', input),
      async () => ({ status: HttpStatus.ACCEPTED, body: await this.smsService.create(principal, input) }),
    );
    res.status(result.status);
    return result.body;
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentPrincipal() principal: AppPrincipal, @Param('id', smsIdPipe) id: string) {
    return this.smsService.cancel(principal, id);
  }

  @Post(':id/retry')
  async retry(
    @CurrentPrincipal() principal: AppPrincipal,
    @IdempotencyKey() key: string,
    @Param('id', smsIdPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.idempotency.execute(
      principal.applicationId,
      key,
      this.idempotency.hashRequest('POST', `/sms/${id}/retry`, {}),
      async () => ({ status: HttpStatus.OK, body: await this.smsService.retry(principal, id) }),
    );
    res.status(result.status);
    return result.body;
  }

  @Get()
  list(@CurrentPrincipal() principal: AppPrincipal, @Query() query: ListSmsQuery) {
    return this.smsService.list(principal, query);
  }

  @Get(':id')
  findOne(
    @CurrentPrincipal() principal: AppPrincipal,
    @Param('id', smsIdPipe) id: string,
  ) {
    return this.smsService.findOne(principal, id);
  }
}
