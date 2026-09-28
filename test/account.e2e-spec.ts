import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, signIn, TestApp } from './test-app';

// Needs the Presidio container: `docker compose up -d`.
describe('Activity, dashboard and account deletion (e2e)', () => {
  let ctx: TestApp;
  const TEXT =
    'Patient: Sarah Johnson\nSSN 429-18-7734\nSeen for persistent headaches and dizziness.';

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(() => ctx.app.close());

  const http = () => request(ctx.app.getHttpServer());
  const as = (token: string) => ({
    get: (url: string) =>
      http().get(url).set('authorization', `Bearer ${token}`),
    post: (url: string) =>
      http().post(url).set('authorization', `Bearer ${token}`),
    del: (url: string) =>
      http().delete(url).set('authorization', `Bearer ${token}`),
  });

  async function useTheApp(email: string) {
    const { accessToken, user } = await signIn(ctx, email);
    const api = as(accessToken);
    const { body: analysis } = await api
      .post('/api/analyses')
      .send({
        text: TEXT,
        language: 'en',
        framework: 'HIPAA',
        method: 'SAFE_HARBOR',
      })
      .expect(201);
    await api
      .post('/api/analyses/extract-text')
      .attach('file', Buffer.from(TEXT.repeat(2)), 'sarah-johnson-report.txt')
      .expect(200);
    const { body: dataset } = await api
      .post('/api/synthetic/datasets')
      .send({
        datasetType: 'LAB_RESULTS',
        framework: 'HIPAA',
        recordCount: 40,
        format: 'JSON',
      })
      .expect(201);
    await api.get(`/api/synthetic/datasets/${dataset.id}/download`).expect(200);
    return { api, user, analysis, dataset };
  }

  it('records an audit trail without personal data', async () => {
    const email = `e2e-audit-${Date.now()}@example.com`;
    const { api, analysis, dataset } = await useTheApp(email);

    const { body: events } = await api.get('/api/activity').expect(200);
    expect(events.map((e) => e.action)).toEqual([
      'synthetic.dataset_downloaded',
      'synthetic.dataset_created',
      'document.text_extracted',
      'analysis.created',
      'auth.login',
    ]);
    expect(events[3]).toMatchObject({
      resourceId: analysis.id,
      metadata: { framework: 'HIPAA', method: 'SAFE_HARBOR', language: 'en' },
    });
    expect(events[0].resourceId).toBe(dataset.id);
    expect(events[2].metadata).toEqual({
      format: 'txt',
      characters: expect.any(Number),
    });

    const stored = JSON.stringify(events);
    for (const leaked of ['Sarah', '429-18', 'sarah-johnson-report', email]) {
      expect(stored).not.toContain(leaked);
    }

    const { body: page } = await api
      .get(
        `/api/activity?limit=2&before=${encodeURIComponent(events[1].createdAt)}`,
      )
      .expect(200);
    expect(page.map((e) => e.action)).toEqual([
      'document.text_extracted',
      'analysis.created',
    ]);
  });

  it('summarizes usage for the dashboard', async () => {
    const { api, analysis } = await useTheApp(
      `e2e-dash-${Date.now()}@example.com`,
    );
    const { body } = await api.get('/api/dashboard').expect(200);
    expect(body.analyses).toEqual({
      count: 1,
      entitiesDetected: analysis.stats.detected,
    });
    expect(body.datasets).toEqual({
      count: 1,
      recordsGenerated: 40,
      active: 1,
    });
    expect(body.recentActivity).toHaveLength(5);
  });

  it('deletes the account and everything it owns', async () => {
    const email = `e2e-delete-${Date.now()}@example.com`;
    const { api, user } = await useTheApp(email);

    await api
      .del('/api/auth/me')
      .send({ email: 'someone@else.com' })
      .expect(400);
    await api
      .del('/api/auth/me')
      .send({ email: email.toUpperCase() })
      .expect(204);

    const db = ctx.app.get(DataSource);
    for (const table of [
      'users',
      'analyses',
      'synthetic_datasets',
      'refresh_tokens',
      'audit_events',
    ]) {
      const column = table === 'users' ? 'id' : 'user_id';
      const [{ count }] = await db.query(
        `SELECT count(*)::int AS count FROM ${table} WHERE ${column} = $1`,
        [user.id],
      );
      expect({ table, count }).toEqual({ table, count: 0 });
    }
    const [{ count }] = await db.query(
      'SELECT count(*)::int AS count FROM magic_link_tokens WHERE email = $1',
      [email],
    );
    expect(count).toBe(0);

    // The access token hasn't expired, but it no longer grants access.
    await api.get('/api/auth/me').expect(401);
    await api
      .post('/api/synthetic/datasets')
      .send({
        datasetType: 'LAB_RESULTS',
        framework: 'HIPAA',
        recordCount: 1,
        format: 'CSV',
      })
      .expect(401);
  });
});
