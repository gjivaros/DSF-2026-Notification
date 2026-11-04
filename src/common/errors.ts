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
