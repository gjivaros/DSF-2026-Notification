import { SmsCategory } from '@prisma/client';
import { businessDay, computeSendAt, nextInfoWindow } from './time';

// Builds an instant from a GMT+1 wall-clock time
const local = (iso: string) => new Date(`${iso}+01:00`);

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as { getResponse(): { code: string } }).getResponse().code;
  }
  return undefined;
};

describe('businessDay', () => {
  it('uses the GMT+1 calendar day', () => {
    // 23:30 UTC on Jan 1st is 00:30 GMT+1 on Jan 2nd
    expect(businessDay(new Date('2026-01-01T23:30:00Z'))).toEqual(
      new Date('2026-01-02T00:00:00Z'),
    );
    // 22:59 UTC is still 23:59 GMT+1 the same day
    expect(businessDay(new Date('2026-01-01T22:59:00Z'))).toEqual(
      new Date('2026-01-01T00:00:00Z'),
    );
  });
});

describe('nextInfoWindow', () => {
  it.each([
    ['2026-01-01T06:59:00', '2026-01-01T07:00:00'],
    ['2026-01-01T07:00:00', '2026-01-01T07:00:00'],
    ['2026-01-01T20:59:00', '2026-01-01T20:59:00'],
    ['2026-01-01T21:00:00', '2026-01-02T07:00:00'],
    ['2026-01-01T23:30:00', '2026-01-02T07:00:00'],
    ['2026-01-01T00:30:00', '2026-01-01T07:00:00'],
    ['2026-12-31T22:00:00', '2027-01-01T07:00:00'],
  ])('%s GMT+1 is sent at %s GMT+1', (input, expected) => {
    expect(nextInfoWindow(local(input))).toEqual(local(expected));
  });
});

describe('computeSendAt', () => {
  const now = local('2026-01-01T22:00:00');

  it('sends OTP immediately, even outside the INFO window', () => {
    expect(computeSendAt(SmsCategory.OTP, undefined, now)).toEqual(now);
  });

  it('rejects a scheduled OTP', () => {
    expect(
      codeOf(() => computeSendAt(SmsCategory.OTP, local('2026-01-02T10:00:00'), now)),
    ).toBe('OTP_CANNOT_BE_SCHEDULED');
  });

  it('postpones INFO submitted outside the window', () => {
    expect(computeSendAt(SmsCategory.INFO, undefined, now)).toEqual(
      local('2026-01-02T07:00:00'),
    );
  });

  it('keeps a scheduled INFO inside the window', () => {
    const scheduledAt = local('2026-01-02T10:00:00');
    expect(computeSendAt(SmsCategory.INFO, scheduledAt, now)).toEqual(scheduledAt);
  });

  it('postpones a scheduled INFO outside the window', () => {
    expect(
      computeSendAt(SmsCategory.INFO, local('2026-01-02T22:00:00'), now),
    ).toEqual(local('2026-01-03T07:00:00'));
  });

  it('rejects a scheduled date in the past', () => {
    expect(
      codeOf(() => computeSendAt(SmsCategory.INFO, local('2026-01-01T21:00:00'), now)),
    ).toBe('INVALID_SCHEDULED_AT');
  });
});
