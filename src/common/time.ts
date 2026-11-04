import { SmsCategory } from '@prisma/client';
import { Errors } from './errors';

// Benin business time: fixed GMT+1, no daylight saving
const OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const INFO_WINDOW_START_HOUR = 7;
const INFO_WINDOW_END_HOUR = 21;

// Shifts an instant so that its UTC getters read GMT+1 wall-clock values
function toLocal(date: Date): Date {
  return new Date(date.getTime() + OFFSET_MS);
}

// Calendar day in GMT+1, as a UTC midnight date (fits a Postgres DATE column)
export function businessDay(date: Date): Date {
  const local = toLocal(date);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  );
}

// Instant of HH:00 GMT+1 on the given business day
function atLocalHour(day: Date, hour: number): Date {
  return new Date(day.getTime() + hour * 60 * 60 * 1000 - OFFSET_MS);
}

export function isInInfoWindow(date: Date): boolean {
  const hour = toLocal(date).getUTCHours();
  return hour >= INFO_WINDOW_START_HOUR && hour < INFO_WINDOW_END_HOUR;
}

// Returns the date itself when inside [07:00, 21:00[ GMT+1, otherwise the next 07:00 GMT+1
export function nextInfoWindow(date: Date): Date {
  if (isInInfoWindow(date)) return date;
  const day = businessDay(date);
  const hour = toLocal(date).getUTCHours();
  const targetDay =
    hour < INFO_WINDOW_START_HOUR ? day : new Date(day.getTime() + DAY_MS);
  return atLocalHour(targetDay, INFO_WINDOW_START_HOUR);
}

export function computeSendAt(
  category: SmsCategory,
  scheduledAt: Date | undefined,
  now: Date,
): Date {
  if (category === SmsCategory.OTP) {
    if (scheduledAt) throw Errors.otpCannotBeScheduled();
    return now;
  }
  if (scheduledAt && scheduledAt.getTime() < now.getTime()) {
    throw Errors.invalidScheduledAt();
  }
  return nextInfoWindow(scheduledAt ?? now);
}
