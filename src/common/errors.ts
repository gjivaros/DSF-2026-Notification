import { HttpException, HttpStatus } from '@nestjs/common';

export interface ErrorBody {
  code: string;
  message: string;
}

export class AppException extends HttpException {
  constructor(status: HttpStatus, code: string, message: string) {
    super({ code, message } satisfies ErrorBody, status);
  }
}

export const Errors = {
  validation: (message: string) =>
    new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', message),
  invalidPhoneNumber: () =>
    new AppException(
      HttpStatus.BAD_REQUEST,
      'INVALID_PHONE_NUMBER',
      'Phone number must be 10 digits starting with 01',
    ),
  unknownOperator: () =>
    new AppException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'UNKNOWN_OPERATOR',
      'No operator matches this phone number prefix',
    ),
  textTooLong: () =>
    new AppException(
      HttpStatus.BAD_REQUEST,
      'TEXT_TOO_LONG',
      'Text exceeds the maximum of 6 segments',
    ),
  otpCannotBeScheduled: () =>
    new AppException(
      HttpStatus.BAD_REQUEST,
      'OTP_CANNOT_BE_SCHEDULED',
      'OTP messages are sent immediately and cannot be scheduled',
    ),
  invalidScheduledAt: () =>
    new AppException(
      HttpStatus.BAD_REQUEST,
      'INVALID_SCHEDULED_AT',
      'Scheduled date must be in the future',
    ),
  invalidCredentials: () =>
    new AppException(
      HttpStatus.UNAUTHORIZED,
      'INVALID_CREDENTIALS',
      'Missing or invalid credentials',
    ),
  invalidSignature: () =>
    new AppException(
      HttpStatus.UNAUTHORIZED,
      'INVALID_SIGNATURE',
      'Missing or invalid signature',
    ),
  forbidden: () =>
    new AppException(
      HttpStatus.FORBIDDEN,
      'FORBIDDEN',
      'You are not allowed to perform this action',
    ),
  notFound: (message = 'Resource not found') =>
    new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', message),
  smsNotFound: () =>
    new AppException(HttpStatus.NOT_FOUND, 'SMS_NOT_FOUND', 'SMS not found'),
  smsNotCancellable: () =>
    new AppException(HttpStatus.CONFLICT, 'SMS_NOT_CANCELLABLE', 'Only a pending SMS can be cancelled'),
  smsNotRetryable: () =>
    new AppException(HttpStatus.CONFLICT, 'SMS_NOT_RETRYABLE', 'Only a failed SMS can be retried'),
  campaignNotFound: () =>
    new AppException(HttpStatus.NOT_FOUND, 'CAMPAIGN_NOT_FOUND', 'Campaign not found'),
  invalidRecipients: (recipients: string[]) =>
    new AppException(
      HttpStatus.BAD_REQUEST,
      'INVALID_RECIPIENTS',
      `Invalid recipients: ${recipients.join(', ')}`,
    ),
  tooManyRecipients: (max: number) =>
    new AppException(
      HttpStatus.BAD_REQUEST,
      'TOO_MANY_RECIPIENTS',
      `A campaign accepts at most ${max} recipients`,
    ),
  quotaExceeded: () =>
    new AppException(
      HttpStatus.TOO_MANY_REQUESTS,
      'QUOTA_EXCEEDED',
      'Daily quota exceeded for this application',
    ),
  idempotencyKeyRequired: () =>
    new AppException(
      HttpStatus.BAD_REQUEST,
      'IDEMPOTENCY_KEY_REQUIRED',
      'Idempotency-Key header is required (1 to 255 characters)',
    ),
  idempotencyInProgress: () =>
    new AppException(
      HttpStatus.CONFLICT,
      'IDEMPOTENCY_IN_PROGRESS',
      'A request with this Idempotency-Key is still in progress',
    ),
  idempotencyKeyReused: () =>
    new AppException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'IDEMPOTENCY_KEY_REUSED',
      'This Idempotency-Key was already used with a different request',
    ),
  rateLimitExceeded: () =>
    new AppException(
      HttpStatus.TOO_MANY_REQUESTS,
      'RATE_LIMIT_EXCEEDED',
      'Too many requests, please slow down',
    ),
  serviceUnavailable: (message: string) =>
    new AppException(
      HttpStatus.SERVICE_UNAVAILABLE,
      'SERVICE_UNAVAILABLE',
      message,
    ),
};
