import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Errors } from '../common/errors';

const MAX_KEY_LENGTH = 255;

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const value = context.switchToHttp().getRequest().headers['idempotency-key'];
    if (typeof value !== 'string' || value.length === 0 || value.length > MAX_KEY_LENGTH) {
      throw Errors.idempotencyKeyRequired();
    }
    return value;
  },
);
