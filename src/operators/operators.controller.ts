import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Operator } from '@prisma/client';
import { Public } from '../auth/auth.decorators';
import { DlrSignatureGuard } from './dlr-signature.guard';
import { DeliveryReportInput } from './operators.inputs';
import { OperatorsService } from './operators.service';

@Controller('operators')
export class OperatorsController {
  constructor(private readonly operatorsService: OperatorsService) {}

  // Operator callbacks are authenticated by signature and not rate limited (bulk delivery reports)
  @Public()
  @SkipThrottle()
  @UseGuards(DlrSignatureGuard)
  @Post(':operator/dlr')
  @HttpCode(HttpStatus.OK)
  deliveryReport(@Param('operator') operator: string, @Body() input: DeliveryReportInput) {
    return this.operatorsService.handleDeliveryReport(operator.toUpperCase() as Operator, input);
  }
}
