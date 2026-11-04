import { Operator } from '@prisma/client';
import { Errors } from './errors';

const PHONE_PATTERN = /^01\d{8}$/;

// Inclusive ranges on the two digits following the "01" prefix
const OPERATOR_RANGES: { operator: Operator; min: number; max: number }[] = [
  { operator: Operator.CELTIIS, min: 40, max: 49 },
  { operator: Operator.MTN, min: 50, max: 69 },
  { operator: Operator.MOOV, min: 90, max: 99 },
];

export function validatePhone(phone: string): void {
  if (!PHONE_PATTERN.test(phone)) throw Errors.invalidPhoneNumber();
}

export function resolveOperator(phone: string): Operator {
  validatePhone(phone);
  const prefix = Number(phone.slice(2, 4));
  const range = OPERATOR_RANGES.find((r) => prefix >= r.min && prefix <= r.max);
  if (!range) throw Errors.unknownOperator();
  return range.operator;
}
