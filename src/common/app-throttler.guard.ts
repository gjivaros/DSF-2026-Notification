import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Rate limit per application when identified by its code, per IP otherwise
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(request: Record<string, any>): Promise<string> {
    const code = request.headers?.['x-app-code'];
    return typeof code === 'string' && code ? `app:${code}` : `ip:${request.ip}`;
  }
}
