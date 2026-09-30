import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ContactModule } from './contact/contact.module';
import { envValidationSchema } from './config/env.validation';
import { buildTypeOrmOptions } from './database/typeorm.config';
import { DeidentifyModule } from './deidentify/deidentify.module';
import { HealthController } from './health/health.controller';
import { SyntheticModule } from './synthetic/synthetic.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildTypeOrmOptions({
          DATABASE_URL: config.getOrThrow('DATABASE_URL'),
          DATABASE_SSL: config.get('DATABASE_SSL'),
        }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    AuditModule,
    UsersModule,
    AuthModule,
    DeidentifyModule,
    SyntheticModule,
    ContactModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
