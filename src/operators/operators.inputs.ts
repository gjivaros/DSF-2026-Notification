import { FailureReason } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';

export class DeliveryReportInput {
  @IsString()
  operatorMessageId: string;

  @IsIn(['delivered', 'failed'])
  status: 'delivered' | 'failed';

  @IsOptional()
  @IsEnum(FailureReason)
  failureReason?: FailureReason;
}
