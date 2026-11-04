import { Module } from '@nestjs/common';
import { SmsModule } from '../sms/sms.module';
import { DlrSignatureGuard } from './dlr-signature.guard';
import { OperatorsController } from './operators.controller';
import { OperatorsService } from './operators.service';
import { OperatorSimulator } from './operators.simulator';
import { SmsProcessor } from './sms.processor';

@Module({
  imports: [SmsModule],
  controllers: [OperatorsController],
  providers: [OperatorSimulator, OperatorsService, SmsProcessor, DlrSignatureGuard],
})
export class OperatorsModule {}
