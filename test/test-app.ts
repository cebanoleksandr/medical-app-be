import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { MailMessage, MailService } from '../src/mail/mail.service';

export interface TestApp {
  app: INestApplication;
  sent: MailMessage[];
}

/** Boots the real app against the dev database; emails are captured in `sent`. */
export async function createTestApp(): Promise<TestApp> {
  const sent: MailMessage[] = [];
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue({ send: async (m: MailMessage) => void sent.push(m) })
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
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
