import { ApiTags } from '@nestjs/swagger';
import { Controller, Headers, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/auth.decorators';
import { WebhooksService } from './webhooks.service';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

@ApiTags('Simulator')
@Controller('simulator')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  // Demo receiver standing for a client application: verifies the signature and logs the event
  @Public()
  @SkipThrottle()
  @Post('webhook-sink')
  @HttpCode(HttpStatus.OK)
  sink(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-app-code') code: string,
    @Headers('x-timestamp') timestamp: string,
    @Headers('x-signature') signature: string,
  ) {
    return this.webhooksService.verifyAndLog(code, timestamp, signature, req.rawBody);
  }
}
