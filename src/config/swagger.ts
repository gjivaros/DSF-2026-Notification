import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NextFunction, Request, Response } from 'express';
import { safeEqual } from '../common/crypto';

const DOCS_PATH = 'docs';

// Minimal HTTP basic auth, scoped to the documentation routes
function basicAuth(user: string, password: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const [scheme, encoded] = (req.headers.authorization ?? '').split(' ');
    const [givenUser, givenPassword] = Buffer.from(encoded ?? '', 'base64').toString().split(':');
    if (scheme === 'Basic' && safeEqual(givenUser ?? '', user) && safeEqual(givenPassword ?? '', password)) {
      return next();
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="SMS Gateway docs"');
    res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Documentation requires basic authentication' });
  };
}

export function setupSwagger(app: INestApplication) {
  const config = app.get(ConfigService);
  app.use(
    [`/${DOCS_PATH}`, `/${DOCS_PATH}-json`],
    basicAuth(config.getOrThrow('SWAGGER_USER'), config.getOrThrow('SWAGGER_PASSWORD')),
  );

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('SMS Gateway')
      .setDescription(
        'Centralized SMS gateway. Applications authenticate with X-App-Code + X-Api-Key; ' +
          'dashboard users with a Bearer token from POST /auth/login. ' +
          'Errors are always { code, message }.',
      )
      .setVersion('1.0')
      .addApiKey({ type: 'apiKey', in: 'header', name: 'X-App-Code' }, 'appCode')
      .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Api-Key' }, 'apiKey')
      .addBearerAuth({ type: 'http', scheme: 'bearer', description: 'Token from POST /auth/login' }, 'session')
      .build(),
  );
  SwaggerModule.setup(DOCS_PATH, app, document, { swaggerOptions: { persistAuthorization: true } });
}
