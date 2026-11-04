import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Response } from 'express';
import { AppException, ErrorBody, Errors } from './errors';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const error = this.toAppException(exception);
    response.status(error.getStatus()).json(error.getResponse() as ErrorBody);
  }

  private toAppException(exception: unknown): HttpException {
    if (exception instanceof AppException) return exception;
    if (exception instanceof ThrottlerException) return Errors.rateLimitExceeded();
    if (exception instanceof NotFoundException) return Errors.notFound();
    if (exception instanceof BadRequestException) {
      // Built by the ValidationPipe exceptionFactory: field names only, never values
      return Errors.validation(exception.message);
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return new AppException(status, HttpStatus[status] ?? 'HTTP_ERROR', exception.message);
    }
    // Log the stack only: request bodies may contain OTP codes
    this.logger.error((exception as Error)?.stack ?? String(exception));
    return new AppException(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'INTERNAL_ERROR',
      'An unexpected error occurred',
    );
  }
}
