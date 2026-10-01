import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { makeDocx, makePdf } from './fixtures';
import { createTestApp, signIn, TestApp } from './test-app';

// Needs the Presidio container: `docker compose up -d`.
describe('Analyses (e2e)', () => {
  let ctx: TestApp;
  let accessToken: string;

  const LINES = [
    'Patient: Sarah Johnson',
    'Date of Visit: March 15, 2026',
    'Medical Record Number: MRN78945612',
    'The patient is a 45-year-old female presenting with persistent headaches.',
    'Patient can be reached at sarah.johnson@email.com',
    'SSN 429-18-7734, IP Address (portal access): 192.168.1.45',
    'Sarah Johnson was referred by Springfield Medical Center.',
  ];
  const TEXT = LINES.join('\n');
  const HIPAA = {
    text: TEXT,
    language: 'en',
    framework: 'HIPAA',
    method: 'SAFE_HARBOR',
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    ({ accessToken } = await signIn(
      ctx,
      `e2e-analyses-${Date.now()}@example.com`,
    ));
  });

  afterAll(() => ctx.app.close());

  const http = () => request(ctx.app.getHttpServer());
  const auth = (req: request.Test, token = accessToken) =>
    req.set('authorization', `Bearer ${token}`);
  const analyze = (body: object) =>
    auth(http().post('/api/analyses')).send(body);
  const render = (id: string, body: object) =>
    auth(http().post(`/api/analyses/${id}/render`)).send(body);

  describe('options', () => {
    it('lists frameworks, methods and output modes', async () => {
      const { body } = await auth(http().get('/api/analyses/options')).expect(
        200,
      );
      expect(body.frameworks.map((f) => f.id)).toEqual([
        'HIPAA',
        'EU_GDPR',
        'UK_GDPR',
        'SWISS_FADP',
      ]);
      const safeHarbor = body.frameworks[0].methods[0];
      expect(safeHarbor.id).toBe('SAFE_HARBOR');
      expect(safeHarbor.identifiers).toHaveLength(18);
      expect(safeHarbor.identifiers[0]).toEqual({
        key: 'names',
        label: 'Names',
      });
      expect(body.outputModes.map((m) => m.id)).toEqual([
        'REDACT',
        'MASK',
        'PLACEHOLDER',
        'PSEUDONYMIZE',
      ]);
    });
  });

  describe('create', () => {
    it('redacts HIPAA identifiers and returns review data', async () => {
      const res = await analyze(HIPAA).expect(201);

      const { deidentifiedText, entities, stats } = res.body;
      for (const value of [
        'Sarah Johnson',
        'March 15, 2026',
        'MRN78945612',
        'sarah.johnson@email.com',
        '429-18-7734',
        '192.168.1.45',
      ]) {
        expect(deidentifiedText).not.toContain(value);
        expect(entities.map((e) => e.text)).toContain(value);
      }
      // Ages under 90 and organizations are not Safe Harbor identifiers.
      expect(deidentifiedText).toContain('45-year-old');
      expect(deidentifiedText).toContain('Springfield Medical Center');
      expect(deidentifiedText).toContain('Patient: [REDACTED]');

      expect(stats.detected).toBe(entities.length);
      expect(stats.avgConfidence).toBeGreaterThan(0);
      expect(res.body.identifiers).toHaveLength(18);
      expect(res.body.sensitivity).toBe('BALANCED');
    });

    it('removes organizations under GDPR anonymisation', async () => {
      const res = await analyze({
        ...HIPAA,
        framework: 'EU_GDPR',
        method: 'ANONYMISATION',
      }).expect(201);
      expect(res.body.deidentifiedText).not.toContain('Springfield');
    });

    it('applies only the chosen identifiers under Expert Determination', async () => {
      const res = await analyze({
        ...HIPAA,
        method: 'EXPERT_DETERMINATION',
        identifiers: ['names'],
      }).expect(201);

      expect(new Set(res.body.entities.map((e) => e.type))).toEqual(
        new Set(['PERSON']),
      );
      expect(res.body.deidentifiedText).toContain('429-18-7734');
    });

    it('rejects identifier choices the method does not allow', async () => {
      await analyze({ ...HIPAA, identifiers: ['names'] }).expect(400);
      await analyze({
        ...HIPAA,
        method: 'EXPERT_DETERMINATION',
        identifiers: [],
      }).expect(400);
      await analyze({ ...HIPAA, method: 'ANONYMISATION' }).expect(400);
      await analyze({ ...HIPAA, identifiers: ['nope'] }).expect(400);
    });

    it('numbers placeholders consistently', async () => {
      const res = await analyze({
        ...HIPAA,
        outputMode: 'PLACEHOLDER',
      }).expect(201);
      const text: string = res.body.deidentifiedText;
      expect(text).toContain('Patient: [PATIENT_1]');
      expect(text).toContain('[PATIENT_1] was referred');
      expect(text).toContain('[MRN_1]');
    });

    it('stores only metadata, never the text', async () => {
      const res = await analyze(HIPAA).expect(201);

      const [row] = await ctx.app
        .get(DataSource)
        .query(
          'SELECT row_to_json(a)::text AS json FROM analyses a WHERE id = $1',
          [res.body.id],
        );
      expect(row.json).not.toContain('Sarah');
      expect(row.json).not.toContain('429-18-7734');
      expect(JSON.parse(row.json).detected_count).toBe(res.body.stats.detected);
    });

    it('handles Ukrainian text', async () => {
      const res = await analyze({
        text: 'Пацієнтка: Олена Петренко\nДата візиту: 15 березня 2026 р.\nТелефон: +380 67 123 4567',
        language: 'uk',
        framework: 'HIPAA',
        method: 'SAFE_HARBOR',
      }).expect(201);

      expect(res.body.deidentifiedText).toBe(
        'Пацієнтка: [REDACTED]\nДата візиту: [REDACTED]\nТелефон: [REDACTED]',
      );
    });

    it('validates input', async () => {
      await analyze({ ...HIPAA, text: 'too short' }).expect(400);
      await analyze({ ...HIPAA, language: 'de' }).expect(400);
      await http().post('/api/analyses').send(HIPAA).expect(401);
    });
  });

  describe('render', () => {
    let analysis: {
      id: string;
      entities: { id: string; text: string; end: number; included: boolean }[];
    };

    beforeAll(async () => {
      analysis = (await analyze(HIPAA).expect(201)).body;
    });

    const withExcluded = (value: string) =>
      analysis.entities.map((e) => ({
        ...e,
        included: e.text !== value,
      }));

    it('leaves excluded entities unchanged and updates the stats', async () => {
      const res = await render(analysis.id, {
        text: TEXT,
        outputMode: 'REDACT',
        entities: withExcluded('192.168.1.45'),
      }).expect(200);

      expect(res.body.deidentifiedText).toContain('192.168.1.45');
      expect(res.body.deidentifiedText).not.toContain('429-18-7734');
      expect(res.body.stats.processed).toBe(analysis.entities.length - 1);
      expect(res.body.stats.detected).toBe(analysis.entities.length);
      const ip = res.body.entities.find((e) => e.text === '192.168.1.45');
      expect(ip).toMatchObject({ included: false, replacement: null });
    });

    it('produces the same pseudonyms on every render', async () => {
      const body = {
        text: TEXT,
        outputMode: 'PSEUDONYMIZE',
        entities: withExcluded(''),
      };
      const first = (await render(analysis.id, body).expect(200)).body;
      const second = (await render(analysis.id, body).expect(200)).body;

      expect(first.deidentifiedText).toBe(second.deidentifiedText);
      expect(first.deidentifiedText).not.toContain('Sarah');
      expect(first.deidentifiedText).toMatch(/SSN \d{3}-\d{2}-\d{4}/);
    });

    it('rejects inconsistent input', async () => {
      const base = {
        text: TEXT,
        outputMode: 'REDACT',
        entities: withExcluded(''),
      };
      await render(analysis.id, { ...base, text: TEXT + ' extra' }).expect(400);
      await render(analysis.id, {
        ...base,
        entities: [
          ...base.entities,
          { ...base.entities[0], id: 'x1', end: base.entities[0].end + 1 },
        ],
      }).expect(400);
      await render(analysis.id, {
        ...base,
        entities: [{ ...base.entities[0], type: 'ORGANIZATION' }],
      }).expect(400);
    });

    it("hides other users' analyses", async () => {
      const other = await signIn(ctx, `e2e-other-${Date.now()}@example.com`);
      await auth(
        http().post(`/api/analyses/${analysis.id}/render`),
        other.accessToken,
      )
        .send({ text: TEXT, outputMode: 'REDACT', entities: [] })
        .expect(404);
    });
  });

  describe('risk levels (GDPR, UK GDPR, FADP)', () => {
    const GDPR = {
      text: TEXT,
      language: 'en',
      framework: 'EU_GDPR',
      method: 'ANONYMISATION',
      riskLevel: 'MEDIUM',
    };
    const replacementOf = (
      body: { entities: { text: string; replacement: string }[] },
      value: string,
    ) => body.entities.find((e) => e.text === value)?.replacement;

    it('serves the presets with the options', async () => {
      const { body } = await auth(http().get('/api/analyses/options')).expect(
        200,
      );
      expect(body.entityConfig.riskLevels).toEqual(['LOW', 'MEDIUM', 'HIGH']);
      expect(body.entityConfig.riskPresets.MEDIUM.PERSON).toBe('TOKEN');
      expect(body.entityConfig.entityTypes).toContainEqual({
        type: 'PHOTO',
        special: true,
        detectable: false,
      });
    });

    it('applies the preset method of each entity type', async () => {
      const { body } = await analyze(GDPR).expect(201);
      expect(body.riskLevel).toBe('MEDIUM');
      expect(body.entityMethods.EMAIL).toBe('REDACT');
      expect(replacementOf(body, 'sarah.johnson@email.com')).toBe('[REDACTED]');
      expect(replacementOf(body, '192.168.1.45')).toBe('192.168.1.0/24');
      expect(replacementOf(body, 'MRN78945612')).toMatch(/^PSN-/);
      const person = body.entities.find((e) => e.type === 'PERSON');
      expect(person.entityType).toBe('PERSON');
      expect(person.replacement).toMatch(/^PATIENT_[0-9A-F]{6}$/);
      expect(body.deidentifiedText).not.toContain('Sarah Johnson');
    });

    it('takes overrides and keeps them on render', async () => {
      const { body } = await analyze({
        ...GDPR,
        entityMethods: { EMAIL: 'MASK' },
      }).expect(201);
      expect(replacementOf(body, 'sarah.johnson@email.com')).toBe(
        's****.*******@email.com',
      );

      const rendered = await render(body.id, {
        text: TEXT,
        entities: body.entities,
        entityMethods: { EMAIL: 'PLACEHOLDER' },
      }).expect(200);
      expect(replacementOf(rendered.body, 'sarah.johnson@email.com')).toBe(
        '[EMAIL_1]',
      );
      expect(rendered.body.entityMethods.EMAIL).toBe('PLACEHOLDER');
    });

    it('rejects invalid configurations', async () => {
      await analyze({ ...GDPR, entityMethods: { PHOTO: 'MASK' } }).expect(400);
      await analyze({ ...GDPR, entityMethods: { SHOE: 'MASK' } }).expect(400);
      await analyze({
        ...GDPR,
        riskLevel: undefined,
        entityMethods: {},
      }).expect(400);
      await analyze({ ...HIPAA, riskLevel: 'LOW' }).expect(400);

      const hipaa = (await analyze(HIPAA).expect(201)).body;
      await render(hipaa.id, {
        text: TEXT,
        entities: hipaa.entities,
      }).expect(400);
    });
  });

  describe('extract-text', () => {
    const upload = (buffer: Buffer, filename: string) =>
      auth(http().post('/api/analyses/extract-text')).attach(
        'file',
        buffer,
        filename,
      );

    it('reads .txt, .docx and .pdf', async () => {
      const txt = await upload(Buffer.from(`﻿${TEXT}`), 'note.txt').expect(200);
      expect(txt.body.text).toBe(TEXT);

      const docx = await upload(await makeDocx(LINES), 'note.docx').expect(200);
      expect(docx.body.text).toContain('Sarah Johnson');
      expect(docx.body.text).toContain('429-18-7734');

      const pdf = await upload(makePdf(LINES), 'report.pdf').expect(200);
      expect(pdf.body.text).toContain('Sarah Johnson');
      expect(pdf.body.text).toContain('MRN78945612');
      expect(pdf.body.characters).toBe(pdf.body.text.length);
    });

    it('rejects unsupported, disguised and empty files', async () => {
      await upload(Buffer.from(TEXT), 'note.rtf').expect(422);
      await upload(Buffer.from(TEXT), 'fake.pdf').expect(422);
      await upload(makePdf([]), 'scan.pdf').expect(422);
      await upload(Buffer.from([0xff, 0xfe, 0x41, 0x42]), 'bad.txt').expect(
        422,
      );
      await auth(http().post('/api/analyses/extract-text')).expect(400);
    });

    it('rejects files over 5 MB', async () => {
      await upload(Buffer.alloc(5 * 1024 * 1024 + 1, 'a'), 'big.txt').expect(
        413,
      );
    });
  });
});
