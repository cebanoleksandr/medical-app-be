import * as ExcelJS from 'exceljs';
import { PassThrough, Writable } from 'stream';
import { col } from '../datasets/types';
import { SyntheticRecord } from '../generator';
import { ClientGoneError, OutputFormat, writeDataset } from './writers';

const columns = [col('id', 'ID'), col('note', 'Note', 'text'), col('n', 'N')];
const records: SyntheticRecord[] = [
  { id: 'SYN-00001', note: 'Line one\nsaid "hi", then left', n: 1.5 },
  { id: 'SYN-00002', note: 'Пацієнтка', n: null },
];

async function* iterate() {
  yield* records;
}

async function render(format: OutputFormat): Promise<Buffer> {
  const out = new PassThrough();
  const chunks: Buffer[] = [];
  out.on('data', (c) => chunks.push(Buffer.from(c)));
  await writeDataset(format, columns, iterate(), out);
  out.end();
  return Buffer.concat(chunks);
}

describe('writeDataset', () => {
  it('writes CSV with a BOM, quoting and empty nulls', async () => {
    const csv = (await render(OutputFormat.CSV)).toString('utf8');
    expect(csv).toBe(
      '﻿id,note,n\r\n' +
        'SYN-00001,"Line one\nsaid ""hi"", then left",1.5\r\n' +
        'SYN-00002,Пацієнтка,\r\n',
    );
  });

  it('writes a JSON array', async () => {
    const json = JSON.parse((await render(OutputFormat.JSON)).toString());
    expect(json).toEqual(records);
  });

  it('writes an XLSX workbook Excel can read back', async () => {
    const workbook = new ExcelJS.Workbook();
    const file = await render(OutputFormat.XLSX);
    await workbook.xlsx.load(file as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.getRow(1).values).toEqual([undefined, 'id', 'note', 'n']);
    expect(sheet.getRow(2).getCell(2).value).toBe(records[0].note);
    expect(sheet.getRow(3).getCell(2).value).toBe('Пацієнтка');
    expect(sheet.rowCount).toBe(3);
  });

  it('stops when the client disconnects', async () => {
    const out = new Writable({ write: (_c, _e, done) => done() });
    out.destroy();
    await expect(
      writeDataset(OutputFormat.CSV, columns, iterate(), out),
    ).rejects.toBeInstanceOf(ClientGoneError);
  });
});
