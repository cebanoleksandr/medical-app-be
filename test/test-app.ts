import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { config } from 'dotenv';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { MailMessage, MailService } from '../src/mail/mail.service';

export interface TestApp {
  app: INestApplication;
  sent: MailMessage[];
}

/**
 * e2e tests create and delete users, so they must never touch a real
 * database. Checked before the app boots (and runs migrations).
 */
function assertLocalDatabase() {
  config();
  const url = process.env.DATABASE_URL ?? '';
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  })();
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(
      `e2e tests only run against a local database, but DATABASE_URL points to "${host || url}". ` +
        'Use the docker compose Postgres (see .env.example).',
    );
  }
}

/** Boots the real app against the dev database; emails are captured in `sent`. */
export async function createTestApp(): Promise<TestApp> {
  assertLocalDatabase();
  const sent: MailMessage[] = [];
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    // Real templates and branding; only the sending is captured.
    .overrideProvider(MailService)
    .useFactory({
      factory: (config: ConfigService) => {
        const mail = new MailService(config);
        mail.send = async (m: MailMessage) => void sent.push(m);
        return mail;
      },
      inject: [ConfigService],
    })
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return { app, sent };
}

export function lastMagicLinkToken(sent: MailMessage[]): string {
  const link = sent.at(-1).text.match(/https?:\/\/\S+/)[0];
  return new URL(link).searchParams.get('token');
}

export async function signIn({ app, sent }: TestApp, email: string) {
  const http = request(app.getHttpServer());
  await http.post('/api/auth/magic-link').send({ email }).expect(202);
  const res = await http
    .post('/api/auth/verify')
    .send({ token: lastMagicLinkToken(sent) })
    .expect(200);
  return res.body as { accessToken: string; user: { id: string } };
}
