import * as ExcelJS from 'exceljs';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { PresidioClient } from '../src/deidentify/presidio.client';
import { createTestApp, signIn, TestApp } from './test-app';

const binary = (res: request.Response, done: (e: Error, b: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};

describe('Synthetic data (e2e)', () => {
  let ctx: TestApp;
  let accessToken: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    ({ accessToken } = await signIn(
      ctx,
      `e2e-synth-${Date.now()}@example.com`,
    ));
  });

  afterAll(() => ctx.app.close());

  const http = () => request(ctx.app.getHttpServer());
  const get = (url: string, token = accessToken) =>
    http().get(url).set('authorization', `Bearer ${token}`);
  const post = (url: string, body: object = {}) =>
    http().post(url).set('authorization', `Bearer ${accessToken}`).send(body);

  const createDataset = (body: object = {}) =>
    post('/api/synthetic/datasets', {
      datasetType: 'CLINICAL_NOTES',
      framework: 'HIPAA',
      recordCount: 1000,
      format: 'CSV',
      ...body,
    });

  it('describes dataset types, formats and sizes', async () => {
    const { body } = await get('/api/synthetic/options').expect(200);
    expect(body.datasetTypes.map((t) => t.id)).toEqual([
      'PATIENT_RECORDS',
      'CLINICAL_NOTES',
      'LAB_RESULTS',
      'PRESCRIPTIONS',
    ]);
    expect(body.maxRecords).toBe(100_000);
    expect(body.bytesPerRecord.PATIENT_RECORDS.CSV).toBeGreaterThan(100);
  });

  it('creates a dataset and previews it like the Generated Data screen', async () => {
    const { body: dataset } = await createDataset().expect(201);
    expect(dataset).toMatchObject({
      records: 1000,
      fields: 11,
      format: 'CSV',
      framework: 'HIPAA',
    });
    expect(dataset.estimatedBytes).toBeGreaterThan(100_000);

    const { body: page } = await get(
      `/api/synthetic/datasets/${dataset.id}/records`,
    ).expect(200);
    expect(page.total).toBe(1000);
    expect(page.rows).toHaveLength(8);
    expect(page.columns).toEqual([
      'record_id',
      'doc_type',
      'age_range',
      'note_date',
      'department',
    ]);
    expect(page.rows[0]).toMatchObject({
      recordId: 'SYN-00001',
      quality: 'GOOD',
      issues: [],
    });
    expect(page.rows[0].values.record_id).toBe('SYN-00001');

    const { body: custom } = await get(
      `/api/synthetic/datasets/${dataset.id}/records?offset=40&limit=2&columns=record_id,note_text`,
    ).expect(200);
    expect(custom.rows.map((r) => r.values.record_id)).toEqual([
      'SYN-00041',
      'SYN-00042',
    ]);

    const { body: record } = await get(
      `/api/synthetic/datasets/${dataset.id}/records/SYN-00041`,
    ).expect(200);
    expect(record.values.note_text).toBe(custom.rows[0].values.note_text);
    expect(Object.keys(record.values)).toHaveLength(11);
    expect(record.quality).toBe('GOOD');

    await get(`/api/synthetic/datasets/${dataset.id}/records/SYN-01001`).expect(
      404,
    );
    await get(
      `/api/synthetic/datasets/${dataset.id}/records?columns=nope`,
    ).expect(400);
  });

  it('downloads the same records in every format', async () => {
    const { body: dataset } = await createDataset({
      datasetType: 'LAB_RESULTS',
      recordCount: 250,
      language: 'uk',
    }).expect(201);
    const url = `/api/synthetic/datasets/${dataset.id}/download`;
    const { body: first } = await get(
      `/api/synthetic/datasets/${dataset.id}/records?limit=1&columns=record_id,test_name,value`,
    ).expect(200);

    const csv = await get(url).buffer(true).parse(binary).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain(
      'synthetic-lab-results-250.csv',
    );
    const bytes: Buffer = csv.body;
    // UTF-8 BOM so Excel shows Cyrillic correctly.
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = bytes.subarray(3).toString('utf8').trim().split('\r\n');
    expect(lines).toHaveLength(251);
    expect(lines[0].startsWith('record_id,patient_ref')).toBe(true);
    expect(lines[1]).toContain(first.rows[0].values.test_name);

    const json = await get(`${url}?format=JSON`).expect(200);
    const rows = JSON.parse(json.text);
    expect(rows).toHaveLength(250);
    expect(rows[0]).toMatchObject(first.rows[0].values);

    const xlsx = await get(`${url}?format=XLSX`)
      .buffer(true)
      .parse(binary)
      .expect(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsx.body as ExcelJS.Buffer);
    expect(workbook.worksheets[0].rowCount).toBe(251);

    await get(`${url}?format=PDF`).expect(400);
  });

  it('streams 100 000 records', async () => {
    const { body: dataset } = await createDataset({
      datasetType: 'PATIENT_RECORDS',
      recordCount: 100_000,
    }).expect(201);
    const res = await get(
      `/api/synthetic/datasets/${dataset.id}/download`,
    ).expect(200);
    expect(res.text.trim().split('\r\n')).toHaveLength(100_001);
    // Within 10% of the size promised on the settings screen.
    const actual = Buffer.byteLength(res.text);
    expect(Math.abs(actual - dataset.estimatedBytes) / actual).toBeLessThan(
      0.1,
    );
  }, 60_000);

  it('regenerates with a new seed', async () => {
    const { body: dataset } = await createDataset().expect(201);
    const { body: again } = await post(
      `/api/synthetic/datasets/${dataset.id}/regenerate`,
    ).expect(201);
    expect(again.id).not.toBe(dataset.id);
    expect(again.records).toBe(dataset.records);

    const note = async (id: string) =>
      (await get(`/api/synthetic/datasets/${id}/records/SYN-00001`)).body.values
        .note_text;
    expect(await note(again.id)).not.toBe(await note(dataset.id));
  });

  it('expires datasets and hides them from other users', async () => {
    const { body: dataset } = await createDataset().expect(201);
    const other = await signIn(
      ctx,
      `e2e-synth-other-${Date.now()}@example.com`,
    );
    await get(
      `/api/synthetic/datasets/${dataset.id}`,
      other.accessToken,
    ).expect(404);

    await ctx.app
      .get(DataSource)
      .query(
        `UPDATE synthetic_datasets SET expires_at = now() - interval '1 minute' WHERE id = $1`,
        [dataset.id],
      );
    await get(`/api/synthetic/datasets/${dataset.id}`).expect(410);
    await get(`/api/synthetic/datasets/${dataset.id}/download`).expect(410);
    // Expired datasets can still be regenerated from their settings.
    await post(`/api/synthetic/datasets/${dataset.id}/regenerate`).expect(201);
  });

  it('validates settings', async () => {
    await createDataset({ recordCount: 100_001 }).expect(400);
    await createDataset({ recordCount: 0 }).expect(400);
    await createDataset({ datasetType: 'IMAGES' }).expect(400);
    await createDataset({ language: 'de' }).expect(400);
  });

  // Needs the Presidio container: `docker compose up -d`.
  it('contains no direct identifiers', async () => {
    const { body: dataset } = await createDataset({ recordCount: 40 }).expect(
      201,
    );
    const { body } = await get(
      `/api/synthetic/datasets/${dataset.id}/records?limit=40&columns=note_text`,
    ).expect(200);

    const presidio = ctx.app.get(PresidioClient);
    const found = await presidio.analyze({
      text: body.rows.map((r) => r.values.note_text).join('\n\n'),
      language: 'en',
      entities: [
        'PERSON',
        'PHONE_NUMBER',
        'EMAIL_ADDRESS',
        'US_SSN',
        'LOCATION',
      ],
      scoreThreshold: 0.6,
    });
    expect(found).toEqual([]);
  });
});
