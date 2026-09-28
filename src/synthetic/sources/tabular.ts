import { UnprocessableEntityException } from '@nestjs/common';
import { parse as parseCsv } from 'csv-parse/sync';
import * as ExcelJS from 'exceljs';
import { extname } from 'path';
import { assertSafeZip } from '../../common/zip-guard';

export interface Table {
  columns: string[];
  /** Cell values as trimmed strings; null when empty. */
  rows: (string | null)[][];
}

export const MIN_ROWS = 50;
export const MAX_ROWS = 100_000;
export const MAX_COLUMNS = 100;

const MISSING = new Set(['', 'na', 'n/a', 'null', 'none', 'nan', '-']);

function cell(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    // exceljs: rich text, hyperlinks and formula results.
    const v = value as {
      text?: unknown;
      result?: unknown;
      richText?: { text: string }[];
    };
    if (v.richText) return cell(v.richText.map((r) => r.text).join(''));
    if ('result' in v) return cell(v.result);
    if ('text' in v) return cell(v.text);
    return cell(JSON.stringify(value));
  }
  const text = String(value).trim();
  return MISSING.has(text.toLowerCase()) ? null : text;
}

function uniqueColumnNames(names: unknown[]): string[] {
  const seen = new Map<string, number>();
  return names.map((raw, i) => {
    const base = cell(raw) ?? `column_${i + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? `${base}_${count + 1}` : base;
  });
}

async function readXlsx(buffer: Buffer): Promise<unknown[][]> {
  await assertSafeZip(buffer);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    // row.values is 1-based.
    rows.push((row.values as unknown[]).slice(1));
  });
  return rows;
}

function readJson(buffer: Buffer): unknown[][] {
  const data = JSON.parse(buffer.toString('utf8'));
  const items: unknown[] = Array.isArray(data)
    ? data
    : (data?.records ?? data?.data);
  if (
    !Array.isArray(items) ||
    !items.every((i) => i && typeof i === 'object')
  ) {
    throw new UnprocessableEntityException(
      'JSON must be an array of objects (or { "records": [...] })',
    );
  }
  const keys = [
    ...new Set(items.slice(0, 1000).flatMap((i) => Object.keys(i))),
  ];
  return [
    keys,
    ...items.map((i) => keys.map((k) => (i as Record<string, unknown>)[k])),
  ];
}

/** Parses an uploaded .csv, .xlsx or .json table into string cells. */
export async function readTable(file: Express.Multer.File): Promise<Table> {
  const extension = extname(file.originalname).toLowerCase();
  let grid: unknown[][];
  try {
    if (extension === '.csv') {
      grid = parseCsv(file.buffer, {
        bom: true,
        relax_column_count: true,
        skip_empty_lines: true,
      });
    } else if (extension === '.xlsx') {
      grid = await readXlsx(file.buffer);
    } else if (extension === '.json') {
      grid = readJson(file.buffer);
    } else {
      throw new UnprocessableEntityException(
        'Supported formats: .xlsx, .csv, .json',
      );
    }
  } catch (err) {
    if (err instanceof UnprocessableEntityException) throw err;
    throw new UnprocessableEntityException(
      `Could not read the ${extension} file`,
    );
  }

  const [header = [], ...body] = grid;
  const columns = uniqueColumnNames(header);
  if (!columns.length)
    throw new UnprocessableEntityException('The file has no columns');
  if (columns.length > MAX_COLUMNS) {
    throw new UnprocessableEntityException(
      `At most ${MAX_COLUMNS} columns are supported`,
    );
  }
  const rows = body
    .map((r) => columns.map((_, i) => cell(r[i])))
    .filter((r) => r.some((v) => v !== null));
  if (rows.length < MIN_ROWS) {
    throw new UnprocessableEntityException(
      `At least ${MIN_ROWS} rows are needed to learn the data's statistics`,
    );
  }
  if (rows.length > MAX_ROWS) {
    throw new UnprocessableEntityException(
      `At most ${MAX_ROWS} rows are supported`,
    );
  }
  return { columns, rows };
}
