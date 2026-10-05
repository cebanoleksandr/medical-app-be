import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, signIn, TestApp } from './test-app';

// Seeds analyses directly, so it runs without Presidio.
describe('Dashboard (e2e)', () => {
  let ctx: TestApp;
  let accessToken: string;
  let userId: string;

  const http = () => request(ctx.app.getHttpServer());
  const auth = (req: request.Test, token = accessToken) =>
    req.set('authorization', `Bearer ${token}`);
  const dashboard = (query: Record<string, string> = {}) =>
    auth(http().get('/api/dashboard').query(query));

  const insert = (row: {
    createdAt: string;
    framework: string;
    outputMode?: string;
    entityMethods?: Record<string, string> | null;
    entityCounts: Record<string, number>;
    processed?: number;
  }) => {
    const detected = Object.values(row.entityCounts).reduce((a, b) => a + b, 0);
    return ctx.app.get(DataSource).query(
      `INSERT INTO analyses (user_id, framework, method, identifiers, output_mode,
         risk_level, entity_methods, language, sensitivity, input_length,
         detected_count, processed_count, avg_confidence, processing_ms,
         entity_counts, created_at)
       VALUES ($1, $2, 'SAFE_HARBOR', '{}', $3, $4, $5, 'en', 'BALANCED', 120,
         $6, $7, 0.9, 10, $8, $9)`,
      [
        userId,
        row.framework,
        row.outputMode ?? 'REDACT',
        row.entityMethods ? 'MEDIUM' : null,
        row.entityMethods ? JSON.stringify(row.entityMethods) : null,
        detected,
        row.processed ?? detected,
        JSON.stringify(row.entityCounts),
        row.createdAt,
      ],
    );
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    const session = await signIn(
      ctx,
      `e2e-dashboard-${Date.now()}@example.com`,
    );
    accessToken = session.accessToken;
    userId = session.user.id;

    await insert({
      createdAt: '2026-04-01T10:00:00Z',
      framework: 'HIPAA',
      outputMode: 'PSEUDONYMIZE',
      entityCounts: { PERSON: 2, DATE_TIME: 1 },
      processed: 2,
    });
    await insert({
      createdAt: '2026-04-03T23:30:00Z',
      framework: 'EU_GDPR',
      entityMethods: { PERSON: 'HASH', EMAIL: 'MASK' },
      entityCounts: { PERSON: 1, EMAIL_ADDRESS: 3, US_SSN: 1 },
    });
    // Outside the period used below.
    await insert({
      createdAt: '2026-03-01T10:00:00Z',
      framework: 'HIPAA',
      entityCounts: { PHONE_NUMBER: 4 },
    });
  });

  afterAll(() => ctx.app.close());

  const PERIOD = {
    from: '2026-04-01T00:00:00Z',
    to: '2026-04-04T23:59:59Z',
  };

  it('requires a session', () => http().get('/api/dashboard').expect(401));

  it('totals the period', async () => {
    const { body } = await dashboard(PERIOD).expect(200);
    expect(body.analyses).toEqual({
      count: 2,
      entitiesDetected: 8,
      entitiesProcessed: 7,
      anonymizationRate: 7 / 8,
    });
    expect(body.datasets).toEqual({ count: 0, recordsGenerated: 0, active: 0 });
  });

  it('counts per day, empty days included', async () => {
    const { body } = await dashboard(PERIOD).expect(200);
    expect(body.activity).toEqual([
      { date: '2026-04-01', documents: 1, entities: 3 },
      { date: '2026-04-02', documents: 0, entities: 0 },
      { date: '2026-04-03', documents: 1, entities: 5 },
      { date: '2026-04-04', documents: 0, entities: 0 },
    ]);
  });

  it('counts days in the given time zone', async () => {
    const { body } = await dashboard({ ...PERIOD, tz: 'Europe/Kyiv' }).expect(
      200,
    );
    // 23:30 UTC on Apr 3 is already Apr 4 in Kyiv, and the period ends on Apr 5.
    expect(body.activity.map((d) => d.date)).toEqual([
      '2026-04-01',
      '2026-04-02',
      '2026-04-03',
      '2026-04-04',
      '2026-04-05',
    ]);
    expect(body.activity.map((d) => d.documents)).toEqual([1, 0, 0, 1, 0]);
  });

  it('breaks down frameworks, entity types and methods', async () => {
    const { body } = await dashboard(PERIOD).expect(200);
    expect(body.frameworks).toEqual([
      { framework: 'EU_GDPR', count: 1 },
      { framework: 'HIPAA', count: 1 },
    ]);

    const types = Object.fromEntries(
      body.entityTypes.map((t) => [t.type, t.count]),
    );
    expect(types).toMatchObject({
      PERSON: 3,
      EMAIL: 3,
      DATE_TIME: 1,
      NATIONAL_ID: 1,
      PHONE: 0,
    });
    expect(body.entityTypes).toHaveLength(18);
    expect(body.entityTypes[0].count).toBeGreaterThanOrEqual(
      body.entityTypes[1].count,
    );

    const methods = Object.fromEntries(
      body.methods.map((m) => [m.method, m.count]),
    );
    // HIPAA: 3 entities pseudonymised. GDPR: PERSON hashed, EMAIL masked,
    // the SSN's type has no method in this row and is left out.
    expect(methods).toMatchObject({
      PSEUDONYMISE: 3,
      HASH: 1,
      MASK: 3,
      REDACT: 0,
    });
  });

  it('filters by framework', async () => {
    const { body } = await dashboard({ ...PERIOD, framework: 'HIPAA' }).expect(
      200,
    );
    expect(body.analyses.count).toBe(1);
    expect(body.frameworks).toEqual([{ framework: 'HIPAA', count: 1 }]);
    expect(body.recentAnalyses.every((a) => a.framework === 'HIPAA')).toBe(
      true,
    );
  });

  it('covers all time without "from" and charts the last 7 days', async () => {
    const { body } = await dashboard({ to: PERIOD.to }).expect(200);
    expect(body.analyses.count).toBe(3);
    expect(body.activity).toHaveLength(7);
    expect(body.activity.at(-1).date).toBe('2026-04-04');
  });

  it('rejects bad periods and zones', async () => {
    await dashboard({ from: PERIOD.to, to: PERIOD.from }).expect(400);
    await dashboard({ from: '2024-01-01T00:00:00Z', to: PERIOD.to }).expect(
      400,
    );
    await dashboard({ tz: 'Mars/Olympus' }).expect(400);
    await dashboard({ framework: 'NOPE' }).expect(400);
  });

  it('lists recent analyses without text', async () => {
    const { body } = await dashboard().expect(200);
    expect(body.recentAnalyses).toHaveLength(3);
    expect(body.recentAnalyses[0]).toEqual({
      id: expect.any(String),
      createdAt: '2026-04-03T23:30:00.000Z',
      framework: 'EU_GDPR',
      method: 'SAFE_HARBOR',
      riskLevel: 'MEDIUM',
      language: 'en',
      characters: 120,
      detected: 5,
      processed: 5,
    });
  });

  describe('GET /analyses', () => {
    const list = (
      query: Record<string, string | number> = {},
      token?: string,
    ) => auth(http().get('/api/analyses').query(query), token);

    it('pages newest first with a total', async () => {
      const first = await list({ limit: 2 }).expect(200);
      expect(first.body).toMatchObject({ total: 3, offset: 0, limit: 2 });
      expect(first.body.items.map((a) => a.createdAt)).toEqual([
        '2026-04-03T23:30:00.000Z',
        '2026-04-01T10:00:00.000Z',
      ]);
      const next = await list({ limit: 2, offset: 2 }).expect(200);
      expect(next.body.items.map((a) => a.createdAt)).toEqual([
        '2026-03-01T10:00:00.000Z',
      ]);
    });

    it('filters by framework and period', async () => {
      const gdpr = await list({ framework: 'EU_GDPR' }).expect(200);
      expect(gdpr.body.total).toBe(1);

      const april = await list(PERIOD).expect(200);
      expect(april.body.total).toBe(2);
      const fromOnly = await list({ from: '2026-04-02T00:00:00Z' }).expect(200);
      expect(fromOnly.body.total).toBe(1);
      const toOnly = await list({ to: '2026-03-31T00:00:00Z' }).expect(200);
      expect(toOnly.body.total).toBe(1);

      await list({ from: PERIOD.to, to: PERIOD.from }).expect(400);
      await list({ limit: 101 }).expect(400);
    });

    it("hides other users' analyses", async () => {
      const other = await signIn(
        ctx,
        `e2e-dashboard-other-${Date.now()}@example.com`,
      );
      const theirs = await list({}, other.accessToken).expect(200);
      expect(theirs.body).toEqual({
        total: 0,
        offset: 0,
        limit: 10,
        items: [],
      });
    });
  });

  describe('GET /analyses/export', () => {
    it('downloads the filtered list as CSV', async () => {
      const res = await auth(
        http().get('/api/analyses/export').query({ framework: 'HIPAA' }),
      ).expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('analyses.csv');
      const lines = res.text
        .replace(/^\uFEFF/, '')
        .trim()
        .split('\r\n');
      expect(lines[0]).toBe(
        'id,created_at,framework,method,risk_level,language,characters,entities_detected,entities_processed',
      );
      expect(lines).toHaveLength(3);
      expect(lines[1]).toMatch(
        /^[0-9a-f-]{36},2026-04-01T10:00:00.000Z,HIPAA,SAFE_HARBOR,,en,120,3,2$/,
      );
    });
  });
});
