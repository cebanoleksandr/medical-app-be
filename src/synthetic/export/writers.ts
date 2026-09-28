import * as ExcelJS from 'exceljs';
import { once } from 'events';
import { Writable } from 'stream';
import { ColumnDefinition } from '../datasets/types';
import { CellValue, SyntheticRecord } from '../generator';

export enum OutputFormat {
  CSV = 'CSV',
  JSON = 'JSON',
  XLSX = 'XLSX',
}

export const FORMATS: Record<
  OutputFormat,
  { extension: string; contentType: string }
> = {
  [OutputFormat.CSV]: {
    extension: 'csv',
    contentType: 'text/csv; charset=utf-8',
  },
  [OutputFormat.JSON]: {
    extension: 'json',
    contentType: 'application/json; charset=utf-8',
  },
  [OutputFormat.XLSX]: {
    extension: 'xlsx',
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
};

export class ClientGoneError extends Error {}

/** Writes with backpressure; stops generating if the client disconnected. */
async function write(out: Writable, chunk: string): Promise<void> {
  if (out.destroyed) throw new ClientGoneError();
  if (!out.write(chunk)) {
    await Promise.race([once(out, 'drain'), once(out, 'close')]);
    if (out.destroyed) throw new ClientGoneError();
  }
}

function csvCell(value: CellValue): string {
  if (value === null) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function writeCsv(
  columns: ColumnDefinition[],
  records: AsyncIterable<SyntheticRecord>,
  out: Writable,
) {
  // BOM so Excel opens Cyrillic text as UTF-8.
  await write(out, '﻿' + columns.map((c) => c.key).join(',') + '\r\n');
  for await (const record of records) {
    await write(
      out,
      columns.map((c) => csvCell(record[c.key])).join(',') + '\r\n',
    );
  }
}

async function writeJson(
  records: AsyncIterable<SyntheticRecord>,
  out: Writable,
) {
  let first = true;
  await write(out, '[');
  for await (const record of records) {
    await write(out, (first ? '\n' : ',\n') + JSON.stringify(record));
    first = false;
  }
  await write(out, '\n]\n');
}

async function writeXlsx(
  columns: ColumnDefinition[],
  records: AsyncIterable<SyntheticRecord>,
  out: Writable,
) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: out,
    useStyles: true,
    useSharedStrings: false,
  });
  const sheet = workbook.addWorksheet('Synthetic data', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = columns.map((c) => ({
    header: c.key,
    key: c.key,
    width: c.type === 'text' ? 80 : Math.max(12, c.key.length + 2),
  }));
  sheet.getRow(1).font = { bold: true };

  for await (const record of records) {
    if (out.destroyed) throw new ClientGoneError();
    sheet.addRow(record).commit();
  }
  sheet.commit();
  await workbook.commit();
}

export async function writeDataset(
  format: OutputFormat,
  columns: ColumnDefinition[],
  records: AsyncIterable<SyntheticRecord>,
  out: Writable,
): Promise<void> {
  switch (format) {
    case OutputFormat.CSV:
      return writeCsv(columns, records, out);
    case OutputFormat.JSON:
      return writeJson(records, out);
    case OutputFormat.XLSX:
      return writeXlsx(columns, records, out);
  }
}
