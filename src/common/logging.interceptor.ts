import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

// One line per request; bodies are never logged (they may contain OTP codes)
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const started = Date.now();
    const log = () => {
      const response = context.switchToHttp().getResponse();
      const route = request.route?.path ?? request.path;
      const app = request.principal?.code ? ` app=${request.principal.code}` : '';
      this.logger.log(`${request.method} ${route} ${response.statusCode} ${Date.now() - started}ms${app}`);
    };
    return next.handle().pipe(tap({ next: log, error: log }));
  }
}
