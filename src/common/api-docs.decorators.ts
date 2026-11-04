import { applyDecorators } from '@nestjs/common';
import { ApiHeader, ApiSecurity, ApiBearerAuth } from '@nestjs/swagger';

// Swagger only: documents how each family of routes authenticates
export const ApiAppAuth = () => applyDecorators(ApiSecurity('appCode'), ApiSecurity('apiKey'));
export const ApiSessionAuth = () => ApiBearerAuth('session');
export const ApiIdempotencyKey = () =>
  ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Unique key per request (1-255 chars), replayed for 24h' });
