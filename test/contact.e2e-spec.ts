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

    expect(ctx.sent).toHaveLength(2);
    const [team, confirmation] = ctx.sent;
    expect(team.to).toBe(ctx.app.get(ConfigService).get('CONTACT_TO_EMAIL'));
    expect(team.replyTo).toBe('olena.p@example.com');
    expect(team.subject).toBe(
      'New contact request: Olena Petrenko (Kyiv Clinic)',
    );
    expect(team.text).toContain('We would like a demo for 20 doctors.');

    expect(confirmation.to).toBe('olena.p@example.com');
    expect(confirmation.subject).toBe('We received your message');
    expect(confirmation.html).toContain('Hi Olena,');
    expect(confirmation.html).toContain('We would like a demo for 20 doctors.');
  });

  it("confirms in the visitor's language", async () => {
    await send({ ...form, locale: 'uk' }).expect(202);
    expect(ctx.sent[1].subject).toBe('Ми отримали ваше повідомлення');
    await send({ ...form, locale: 'de' }).expect(400);
  });

  it('confirms to an address at most once an hour', async () => {
    await send(form).expect(202);
    await send(form).expect(202);
    await send({ ...form, email: 'other@example.com' }).expect(202);
    expect(
      ctx.sent.map((m) => m.to).filter((to) => to !== ctx.sent[0].to),
    ).toEqual(['olena.p@example.com', 'other@example.com']);
  });

  it('accepts the form without the optional fields', async () => {
    await send({
      firstName: 'Ivan',
      lastName: 'Koval',
      email: 'ivan@example.com',
    }).expect(202);
    expect(ctx.sent).toHaveLength(2);
    expect(ctx.sent[1].html).not.toContain('Your message:');
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
    // Five to the team, one confirmation (once per address per hour).
    expect(ctx.sent).toHaveLength(6);
  });

  it('serves the email logo to any client', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/email-assets/logo.png')
      .expect(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(res.body.length).toBeGreaterThan(1000);
  });
});
