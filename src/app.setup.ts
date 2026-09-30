import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';

/**
 * Request handling shared by main.ts and the e2e tests, so tests exercise the
 * exact validation and parsing production uses.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService);

  // Behind Render/Railway's proxy: needed so rate limiting sees the real client IP.
  if (config.get<boolean>('TRUST_PROXY')) app.set('trust proxy', 1);

  app.setGlobalPrefix('api');
  // Default is 100 KB; a render request carries up to 20 000 chars of text
  // plus every entity.
  app.useBodyParser('json', { limit: '1mb' });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: config.get('APP_URL'), credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
