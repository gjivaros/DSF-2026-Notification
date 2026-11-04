import { Injectable } from '@nestjs/common';
import { FailureReason, Operator, SmsStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { DeliveryReportInput } from './operators.inputs';

@Injectable()
export class OperatorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly smsService: SmsService,
  ) {}

  // Idempotent: unknown or already final SMS are ignored
  async handleDeliveryReport(operator: Operator, input: DeliveryReportInput) {
    const sms = await this.prisma.sms.findFirst({
      where: { operatorMessageId: input.operatorMessageId, operator },
    });
    if (sms) {
      const data =
        input.status === 'delivered'
          ? { status: SmsStatus.delivered, deliveredAt: new Date(), text: null }
          : {
              status: SmsStatus.failed,
              failedAt: new Date(),
              failureReason: input.failureReason ?? FailureReason.ECHEC_DEFINITIF,
            };
      await this.smsService.transition(sms.id, SmsStatus.transmitted, data);
    }
    return { received: true };
  }
}
