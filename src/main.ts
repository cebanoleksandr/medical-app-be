import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
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
  app.enableShutdownHooks();

  if (config.get<boolean>('SWAGGER_ENABLED')) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('De-ID Studio API')
        .setDescription(
          'De-identification and synthetic clinical data. Sign in via ' +
            '/auth/magic-link → /auth/verify, then send the access token as a ' +
            'Bearer header; /auth/refresh uses the httpOnly refresh cookie.',
        )
        .setVersion('1.0')
        .addBearerAuth()
        .addSecurityRequirements('bearer')
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(config.get<number>('PORT'));
}
bootstrap();
