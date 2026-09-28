import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { MailMessage } from '../src/mail/mail.service';
import { createTestApp, lastMagicLinkToken } from './test-app';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let sent: MailMessage[];

  const lastToken = () => lastMagicLinkToken(sent);
  const refreshCookie = (res: request.Response) =>
    ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('refresh_token='))
      .split(';')[0];

  beforeAll(async () => {
    ({ app, sent } = await createTestApp());
  });

  afterAll(() => app.close());

  it('signs in with a magic link, refreshes and logs out', async () => {
    const email = `e2e-${Date.now()}@example.com`;
    const http = request(app.getHttpServer());

    await http
      .post('/api/auth/magic-link')
      .send({ email: ` ${email.toUpperCase()} `, locale: 'uk' })
      .expect(202);
    expect(sent.at(-1).to).toBe(email);
    const token = lastToken();

    const verified = await http
      .post('/api/auth/verify')
      .send({ token })
      .expect(200);
    expect(verified.body.user.email).toBe(email);

    await http.post('/api/auth/verify').send({ token }).expect(401);

    await http
      .get('/api/auth/me')
      .set('authorization', `Bearer ${verified.body.accessToken}`)
      .expect(200, { id: verified.body.user.id, email });
    await http.get('/api/auth/me').expect(401);

    const refreshed = await http
      .post('/api/auth/refresh')
      .set('cookie', refreshCookie(verified))
      .expect(200);
    await http
      .post('/api/auth/refresh')
      .set('cookie', refreshCookie(verified))
      .expect(401);

    await http
      .post('/api/auth/logout')
      .set('cookie', refreshCookie(refreshed))
      .expect(204);
    await http
      .post('/api/auth/refresh')
      .set('cookie', refreshCookie(refreshed))
      .expect(401);
  });

  it('revokes the previous link when a new one is requested', async () => {
    const email = `e2e-revoke-${Date.now()}@example.com`;
    const http = request(app.getHttpServer());

    await http.post('/api/auth/magic-link').send({ email }).expect(202);
    const first = lastToken();
    await http.post('/api/auth/magic-link').send({ email }).expect(202);
    const second = lastToken();

    await http.post('/api/auth/verify').send({ token: first }).expect(401);
    await http.post('/api/auth/verify').send({ token: second }).expect(200);
  });
});
