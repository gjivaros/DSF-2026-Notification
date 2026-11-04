import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Operator } from '@prisma/client';
import { hmacSha256Hex, safeEqual } from '../common/crypto';
import { Errors } from '../common/errors';
import { OperatorSimulator } from './operators.simulator';

// Runs before body validation: only reports signed with the operator secret are accepted
@Injectable()
export class DlrSignatureGuard implements CanActivate {
  constructor(private readonly simulator: OperatorSimulator) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const operator = String(request.params.operator).toUpperCase();
    if (!(operator in Operator)) throw Errors.notFound();
    const signature = request.headers['x-signature'];
    const expected = hmacSha256Hex(request.rawBody ?? '', this.simulator.operatorSecret(operator as Operator));
    if (typeof signature !== 'string' || !safeEqual(signature, expected)) {
      throw Errors.invalidSignature();
    }
    return true;
  }
}
