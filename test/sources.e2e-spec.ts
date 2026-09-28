import * as ExcelJS from 'exceljs';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, signIn, TestApp } from './test-app';

// Needs the Presidio container: `docker compose up -d`.
describe('Synthetic sources and validation (e2e)', () => {
  let ctx: TestApp;
  let accessToken: string;

  const FIRST = ['Olivia', 'Liam', 'Emma', 'Noah', 'Ava', 'Elijah', 'Sophia'];
  const LAST = ['Smith', 'Garcia', 'Brown', 'Miller', 'Davis', 'Wilson'];
  const rows = Array.from({ length: 120 }, (_, i) => ({
    patient_name: `${FIRST[i % 7]} ${LAST[i % 6]}`,
    email: `${FIRST[i % 7].toLowerCase()}.${i}@example.org`,
    age: 25 + (i % 50),
    sex: i % 2 ? 'M' : 'F',
    diagnosis: ['Hypertension', 'Diabetes', 'Asthma'][i % 3],
    ward: i === 7 ? 'Rare Ward 7' : ['A', 'B'][i % 2],
    admitted: `2026-0${1 + (i % 8)}-${String(1 + (i % 28)).padStart(2, '0')}`,
  }));
  const csv =
    Object.keys(rows[0]).join(',') +
    '\n' +
    rows.map((r) => Object.values(r).join(',')).join('\n');

  const DOC = [
    'Patient: Sarah Johnson',
    'Date of Visit: March 15, 2026',
    'Medical Record Number: MRN78945612',
    'Chief Complaint: persistent headaches for two weeks.',
    'Sarah Johnson can be reached at sarah.johnson@email.com',
  ].join('\n');

  beforeAll(async () => {
    ctx = await createTestApp();
    ({ accessToken } = await signIn(ctx, `e2e-src-${Date.now()}@example.com`));
  });

  afterAll(() => ctx.app.close());

  const http = () => request(ctx.app.getHttpServer());
  const auth = (req: request.Test) =>
    req.set('authorization', `Bearer ${accessToken}`);
  const upload = (buffer: Buffer, name: string) =>
    auth(http().post('/api/synthetic/sources/file')).attach(
      'file',
      buffer,
      name,
    );
  const createDataset = (body: object) =>
    auth(http().post('/api/synthetic/datasets')).send({
      framework: 'EU_GDPR',
      recordCount: 300,
      format: 'CSV',
      ...body,
    });
  const validation = (id: string) =>
    auth(http().get(`/api/synthetic/datasets/${id}/validation`)).expect(200);

  describe('file source', () => {
    let sourceId: string;

    it('profiles a CSV and replaces identifier columns', async () => {
      const { body } = await upload(Buffer.from(csv), 'patients.csv').expect(
        201,
      );
      sourceId = body.id;
      const kinds = Object.fromEntries(
        body.summary.columns.map((c) => [c.key, c.kind]),
      );
      expect(kinds).toEqual({
        patient_name: 'identifier',
        email: 'identifier',
        age: 'number',
        sex: 'category',
        diagnosis: 'category',
        ward: 'category',
        admitted: 'date',
      });
      expect(body.summary.rows).toBe(120);
    });

    it('stores the profile encrypted, without raw values', async () => {
      const [row] = await ctx.app
        .get(DataSource)
        .query(
          `SELECT encode(payload, 'escape') AS payload, summary::text AS summary FROM synthetic_sources WHERE id = $1`,
          [sourceId],
        );
      for (const leaked of [
        'Hypertension',
        'Olivia',
        'example.org',
        'Rare Ward',
      ]) {
        expect(row.payload).not.toContain(leaked);
        expect(row.summary).not.toContain(leaked);
      }
    });

    it('generates a dataset that follows the source and leaks nothing', async () => {
      const { body: dataset } = await createDataset({ sourceId }).expect(201);
      expect(dataset).toMatchObject({
        datasetType: 'FROM_FILE',
        sourceId,
        fields: 8,
      });

      const file = await auth(
        http().get(`/api/synthetic/datasets/${dataset.id}/download`),
      ).expect(200);
      for (const leaked of ['Olivia', 'Smith', 'example.org', 'Rare Ward 7']) {
        expect(file.text).not.toContain(leaked);
      }
      expect(file.text).toContain('SYN-PATI-00001');
      expect(file.text).toMatch(/Hypertension|Diabetes|Asthma/);

      const { body: report } = await validation(dataset.id);
      expect(report.compliance).toMatchObject({
        framework: 'EU_GDPR',
        riskLevel: 'LOW',
        directIdentifiers: 'NOT_DETECTED',
      });
      expect(report.quality).toMatchObject({
        quality: 'GOOD',
        consistency: 'HIGH',
      });
      expect(report.quality.fidelity).toBeGreaterThan(0.9);
      expect(report.checks.every((c) => c.passed)).toBe(true);
      expect(report.checks.map((c) => c.id)).toEqual([
        'dates_transformed',
        'free_text_checked',
        'export_format_validated',
        'synthetic_identifiers_generated',
        'direct_identifiers_removed',
      ]);
    });

    it('reads .xlsx and .json too', async () => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('data');
      sheet.addRow(Object.keys(rows[0]));
      rows.forEach((r) => sheet.addRow(Object.values(r)));
      const xlsx = Buffer.from(await workbook.xlsx.writeBuffer());
      const fromXlsx = await upload(xlsx, 'patients.xlsx').expect(201);
      expect(fromXlsx.body.summary.rows).toBe(120);

      const fromJson = await upload(
        Buffer.from(JSON.stringify(rows)),
        'patients.json',
      ).expect(201);
      expect(fromJson.body.summary.columns).toHaveLength(7);
    });

    it('rejects files it cannot learn from', async () => {
      await upload(Buffer.from('a,b\n1,2\n'), 'tiny.csv').expect(422);
      await upload(Buffer.from(csv), 'patients.txt').expect(422);
      await upload(Buffer.from('{"not": "an array"}'), 'x.json').expect(422);
    });
  });

  describe('document source', () => {
    let analysis: {
      id: string;
      entities: { id: string; text: string; included: boolean }[];
    };

    beforeAll(async () => {
      analysis = (
        await auth(http().post('/api/analyses'))
          .send({
            text: DOC,
            language: 'en',
            framework: 'HIPAA',
            method: 'SAFE_HARBOR',
          })
          .expect(201)
      ).body;
    });

    const fromAnalysis = (excluded: string[] = []) =>
      auth(http().post('/api/synthetic/sources/analysis')).send({
        analysisId: analysis.id,
        text: DOC,
        entities: analysis.entities.map((e) => ({
          ...e,
          included: !excluded.includes(e.text),
        })),
      });

    it('creates document variants with consistent fake identifiers', async () => {
      const { body: source } = await fromAnalysis().expect(201);
      expect(source.summary.identifiersReplaced).toBe(analysis.entities.length);

      const { body: dataset } = await createDataset({
        sourceId: source.id,
        recordCount: 20,
      }).expect(201);
      expect(dataset.datasetType).toBe('FROM_DOCUMENT');

      const { body: page } = await auth(
        http().get(`/api/synthetic/datasets/${dataset.id}/records?limit=20`),
      ).expect(200);
      const texts: string[] = page.rows.map((r) => r.values.document_text);
      expect(new Set(texts).size).toBe(20);
      for (const text of texts) {
        expect(text).not.toContain('Sarah Johnson');
        expect(text).not.toContain('MRN78945612');
        expect(text).toContain('Chief Complaint: persistent headaches');
        const name = /^Patient: (.+)$/m.exec(text)[1];
        expect(text).toContain(`${name} can be reached at`);
      }

      const { body: report } = await validation(dataset.id);
      expect(report.compliance.riskLevel).toBe('LOW');
      expect(report.checks.every((c) => c.passed)).toBe(true);
    });

    it('flags identifiers the reviewer kept in the document', async () => {
      const { body: source } = await fromAnalysis(['Sarah Johnson']).expect(
        201,
      );
      const { body: dataset } = await createDataset({
        sourceId: source.id,
        recordCount: 5,
      }).expect(201);
      const { body: report } = await validation(dataset.id);

      expect(report.compliance.riskLevel).toBe('HIGH');
      expect(report.compliance.directIdentifiers).toBe('DETECTED');
      expect(report.findings).toContainEqual({
        recordId: null,
        field: 'document_text',
        entityType: 'PERSON',
      });
      const failed = report.checks.filter((c) => !c.passed).map((c) => c.id);
      expect(failed).toEqual([
        'free_text_checked',
        'direct_identifiers_removed',
      ]);
    });

    it('rejects text that differs from the analysis', async () => {
      await auth(http().post('/api/synthetic/sources/analysis'))
        .send({ analysisId: analysis.id, text: DOC + ' extra', entities: [] })
        .expect(400);
    });
  });

  describe('built-in datasets', () => {
    it('validates as fully synthetic, low risk and consistent', async () => {
      const { body: dataset } = await createDataset({
        datasetType: 'PATIENT_RECORDS',
        framework: 'HIPAA',
        format: 'XLSX',
      }).expect(201);
      const { body: report } = await validation(dataset.id);
      expect(report.compliance).toMatchObject({
        riskLevel: 'LOW',
        directIdentifiers: 'NOT_DETECTED',
        riskFactors: ['Fully synthetic: no real individual is represented'],
      });
      expect(report.quality).toMatchObject({
        quality: 'GOOD',
        consistency: 'HIGH',
        consistencyRate: 1,
        fidelity: null,
        warnings: 0,
      });
      expect(report.checks.every((c) => c.passed)).toBe(true);
    });

    it('requires exactly one of datasetType and sourceId', async () => {
      await createDataset({}).expect(400);
      await createDataset({
        datasetType: 'PATIENT_RECORDS',
        sourceId: '00000000-0000-4000-8000-000000000000',
      }).expect(400);
    });
  });

  it('expires sources and the datasets built on them', async () => {
    const { body: source } = await upload(Buffer.from(csv), 'p.csv').expect(
      201,
    );
    const { body: dataset } = await createDataset({
      sourceId: source.id,
    }).expect(201);
    const db = ctx.app.get(DataSource);
    await db.query(
      `UPDATE synthetic_sources SET expires_at = now() - interval '1 minute' WHERE id = $1`,
      [source.id],
    );
    await auth(http().get(`/api/synthetic/sources/${source.id}`)).expect(410);

    // The purge deletes it; the dataset then can't be generated or regenerated.
    await db.query(`DELETE FROM synthetic_sources WHERE id = $1`, [source.id]);
    await auth(http().get(`/api/synthetic/datasets/${dataset.id}`)).expect(410);
    await auth(
      http().post(`/api/synthetic/datasets/${dataset.id}/regenerate`),
    ).expect(410);
  });
});
