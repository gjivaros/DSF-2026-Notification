import { Operator } from '@prisma/client';
import { resolveOperator, validatePhone } from './phone';

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as { getResponse(): { code: string } }).getResponse().code;
  }
  return undefined;
};

describe('validatePhone', () => {
  it.each(['0150000000', '0199999999'])('accepts %s', (phone) => {
    expect(() => validatePhone(phone)).not.toThrow();
  });

  it.each(['50000000', '0250000000', '015000000', '01500000000', '01500000ab', ''])(
    'rejects %s',
    (phone) => {
      expect(codeOf(() => validatePhone(phone))).toBe('INVALID_PHONE_NUMBER');
    },
  );
});

describe('resolveOperator', () => {
  it.each([
    ['0140000000', Operator.CELTIIS],
    ['0149000000', Operator.CELTIIS],
    ['0150000000', Operator.MTN],
    ['0169000000', Operator.MTN],
    ['0190000000', Operator.MOOV],
    ['0199000000', Operator.MOOV],
  ])('routes %s to %s', (phone, operator) => {
    expect(resolveOperator(phone)).toBe(operator);
  });

  it.each(['0139000000', '0170000000', '0189000000', '0100000000'])(
    'rejects unknown prefix %s',
    (phone) => {
      expect(codeOf(() => resolveOperator(phone))).toBe('UNKNOWN_OPERATOR');
    },
  );

  it('rejects an invalid number before routing', () => {
    expect(codeOf(() => resolveOperator('0250000000'))).toBe('INVALID_PHONE_NUMBER');
  });
});
