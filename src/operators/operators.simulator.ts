import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FailureReason, Operator } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hmacSha256Hex } from '../common/crypto';

export class OperatorError extends Error {
  constructor(readonly reason: FailureReason) {
    super(reason);
  }
}

// Deterministic failures, driven by the last digit of the recipient
const FAILURE_BY_LAST_DIGIT: Record<string, FailureReason> = {
  '7': FailureReason.ECHEC_TEMPORAIRE,
  '8': FailureReason.ECHEC_DEFINITIF,
  '9': FailureReason.ECHEC_OPERATEUR,
};

const RANDOM_FAILURE_RATES: [FailureReason, string][] = [
  [FailureReason.ECHEC_TEMPORAIRE, 'SIMULATOR_TEMPORARY_FAILURE_RATE'],
  [FailureReason.ECHEC_DEFINITIF, 'SIMULATOR_DEFINITIVE_FAILURE_RATE'],
  [FailureReason.ECHEC_OPERATEUR, 'SIMULATOR_OPERATOR_FAILURE_RATE'],
];

// Simulates MTN, MOOV and CELTIIS: synchronous acceptance, then an asynchronous signed delivery report
@Injectable()
export class OperatorSimulator implements OnModuleDestroy {
  private readonly logger = new Logger(OperatorSimulator.name);
  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(private readonly config: ConfigService) {}

  async send(operator: Operator, recipient: string, _text: string) {
    const failure = this.simulatedFailure(recipient);
    if (failure) throw new OperatorError(failure);
    return { operatorMessageId: `${operator}-${randomUUID()}` };
  }

  operatorSecret(operator: Operator): string {
    return this.config.getOrThrow(`OPERATOR_SECRET_${operator}`);
  }

  // In-memory timer: a restart loses pending reports, acceptable for a simulator
  scheduleDeliveryReport(operator: Operator, operatorMessageId: string) {
    const timer = setTimeout(async () => {
      this.timers.delete(timer);
      const body = JSON.stringify({ operatorMessageId, status: 'delivered' });
      try {
        await fetch(`${this.config.getOrThrow('APP_URL')}/operators/${operator}/dlr`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Signature': hmacSha256Hex(body, this.operatorSecret(operator)),
          },
          body,
        });
      } catch {
        this.logger.warn(`Delivery report callback failed for ${operatorMessageId}`);
      }
    }, this.config.getOrThrow<number>('SIMULATOR_DLR_DELAY_MS'));
    this.timers.add(timer);
  }

  onModuleDestroy() {
    this.timers.forEach(clearTimeout);
  }

  private simulatedFailure(recipient: string): FailureReason | null {
    const byDigit = FAILURE_BY_LAST_DIGIT[recipient.slice(-1)];
    if (byDigit) return byDigit;
    for (const [reason, rateKey] of RANDOM_FAILURE_RATES) {
      if (Math.random() < this.config.getOrThrow<number>(rateKey)) return reason;
    }
    return null;
  }
}
