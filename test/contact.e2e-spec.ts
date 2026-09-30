import { ConfigService } from '@nestjs/config';
import * as request from 'supertest';
import { createTestApp, TestApp } from './test-app';

describe('Contact form (e2e)', () => {
  let ctx: TestApp;

  const form = {
    firstName: '  Olena ',
    lastName: 'Petrenko',
    company: 'Kyiv Clinic',
    email: ' Olena.P@Example.com ',
    message: 'We would like a demo for 20 doctors.',
  };

  beforeEach(async () => {
    ctx = await createTestApp();
  });

  afterEach(() => ctx.app.close());

  const send = (body: object) =>
    request(ctx.app.getHttpServer()).post('/api/contact').send(body);

  it('emails the team with the visitor as Reply-To, without auth', async () => {
    const { body } = await send(form).expect(202);
    expect(body.message).toMatch(/within 24 hours/);

    expect(ctx.sent).toHaveLength(1);
    const [mail] = ctx.sent;
    expect(mail.to).toBe(ctx.app.get(ConfigService).get('CONTACT_TO_EMAIL'));
    expect(mail.replyTo).toBe('olena.p@example.com');
    expect(mail.subject).toBe(
      'New contact request: Olena Petrenko (Kyiv Clinic)',
    );
    expect(mail.text).toContain('We would like a demo for 20 doctors.');
  });

  it('accepts the form without the optional fields', async () => {
    await send({
      firstName: 'Ivan',
      lastName: 'Koval',
      email: 'ivan@example.com',
    }).expect(202);
    expect(ctx.sent).toHaveLength(1);
  });

  it('validates the required fields', async () => {
    await send({ ...form, firstName: '   ' }).expect(400);
    await send({ ...form, lastName: undefined }).expect(400);
    await send({ ...form, email: 'not-an-email' }).expect(400);
    await send({ ...form, message: 'x'.repeat(5001) }).expect(400);
    await send({ ...form, extra: 'field' }).expect(400);
    expect(ctx.sent).toHaveLength(0);
  });

  it('silently drops submissions that fill the honeypot', async () => {
    await send({ ...form, website: 'http://spam.test' }).expect(202);
    expect(ctx.sent).toHaveLength(0);
  });

  it('limits submissions per client', async () => {
    for (let i = 0; i < 5; i++) await send(form).expect(202);
    await send(form).expect(429);
    expect(ctx.sent).toHaveLength(5);
  });
});
