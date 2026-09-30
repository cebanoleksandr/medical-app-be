import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  configureApp(app);
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
